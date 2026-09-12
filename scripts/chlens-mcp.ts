import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createInterface } from "node:readline";
import type { Duplex } from "node:stream";

import { decode } from "@toon-format/toon";

import {
  buildDebateContext,
  DEBATE_RESULT_SCHEMA,
  type DebatePrepareParams,
  validateDebateResult,
} from "../src/mcp/debate.ts";
import {
  type BridgeOperation,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeThreadResult,
  type LogSearchParams,
  MCP_BRIDGE_HOST,
  MCP_BRIDGE_PORT,
  type ThreadReadParams,
} from "../src/mcp/protocol.ts";
import { normalizeDebateFormats, saveDebateResult } from "./debate-result.ts";

const POLL_TIMEOUT_MS = 25_000;
const REQUEST_TIMEOUT_MS = 45_000;
const CLIENT_TIMEOUT_MS = 90_000;
// TOONはレス本文を含むため、一般的な500レス程度を1回で返せる余裕を持たせる。
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MCP_PROTOCOL_VERSION = "2025-06-18";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}

interface BridgeClient {
  queue: BridgeRequest[];
  waiter?: ServerResponse;
  socket?: LocalWebSocket;
  lastSeen: number;
}

interface PendingBridgeRequest {
  resolve: (response: BridgeResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function logError(message: string, error?: unknown): void {
  // MCPのstdioではstdoutがJSON-RPC専用なので、診断情報はstderrへ分離する。
  console.error(`[ChLens MCP] ${message}`, error ?? "");
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  response.end(text);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("リクエストが大きすぎます");
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return {};
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("JSONオブジェクトを指定してください");
  }
  return parsed as Record<string, unknown>;
}

function closeWaiter(client: BridgeClient, body: unknown): void {
  const waiter = client.waiter;
  if (!waiter) return;
  client.waiter = undefined;
  if (!waiter.writableEnded) writeJson(waiter, 200, body);
}

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_WEBSOCKET_FRAME_BYTES = 8 * 1024 * 1024;

type WebSocketMessageHandler = (message: string) => void;
type WebSocketCloseHandler = () => void;

/**
 * MCP中継のための最小WebSocket実装。
 *
 * 変更理由: このブリッジはNode組み込みAPIだけで起動できることを優先し、
 * `ws`のような常駐依存を増やさない。ブラウザからのマスク済みテキスト、
 * ping、closeだけを扱えば要求とkeepaliveを十分に運べる。
 */
class LocalWebSocket {
  private buffer = Buffer.alloc(0);
  private closed = false;
  private readonly socket: Duplex;
  private readonly onMessage: WebSocketMessageHandler;
  private readonly onClose: WebSocketCloseHandler;

  constructor(
    socket: Duplex,
    onMessage: WebSocketMessageHandler,
    onClose: WebSocketCloseHandler,
    initialData?: Buffer,
  ) {
    this.socket = socket;
    this.onMessage = onMessage;
    this.onClose = onClose;
    socket.on("data", (chunk: Buffer | string) => this.consume(Buffer.from(chunk)));
    socket.on("error", () => this.closeSocket(false));
    socket.on("end", () => this.closeSocket(false));
    socket.on("close", () => this.closeSocket(false));
    if (initialData && initialData.length > 0) this.consume(initialData);
  }

  get isOpen(): boolean {
    return !this.closed && !this.socket.destroyed;
  }

  send(text: string): void {
    if (!this.isOpen) throw new Error("WebSocketが閉じています");
    this.socket.write(this.encodeFrame(Buffer.from(text, "utf8"), 0x1));
  }

  close(): void {
    this.closeSocket(true);
  }

  private closeSocket(sendFrame: boolean): void {
    if (this.closed) return;
    this.closed = true;
    if (sendFrame && !this.socket.destroyed) {
      try {
        this.socket.write(this.encodeFrame(Buffer.alloc(0), 0x8));
      } catch {
        // 既に切断されたソケットへcloseフレームを送れない場合は破棄だけ行う。
      }
    }
    this.socket.destroy();
    this.onClose();
  }

  private consume(chunk: Buffer): void {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > MAX_WEBSOCKET_FRAME_BYTES * 2) {
      this.closeSocket(true);
      return;
    }

    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < offset + 2) return;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) return;
        const longLength = this.buffer.readBigUInt64BE(offset);
        offset += 8;
        if (longLength > BigInt(MAX_WEBSOCKET_FRAME_BYTES)) {
          this.closeSocket(true);
          return;
        }
        length = Number(longLength);
      }

      const maskLength = masked ? 4 : 0;
      if (length > MAX_WEBSOCKET_FRAME_BYTES || this.buffer.length < offset + maskLength + length) {
        if (length > MAX_WEBSOCKET_FRAME_BYTES) this.closeSocket(true);
        return;
      }

      const mask = masked ? this.buffer.subarray(offset, offset + 4) : undefined;
      offset += maskLength;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(offset + length);
      if (mask) {
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= mask[index % 4];
        }
      }

      if ((first & 0x80) === 0 && opcode === 0x1) {
        // 今回の要求は1フレームのJSONだけなので、分割テキストは切断して誤解釈を防ぐ。
        this.closeSocket(true);
        return;
      }
      if (opcode === 0x8) {
        this.closeSocket(true);
        return;
      }
      if (opcode === 0x9) {
        this.socket.write(this.encodeFrame(payload, 0xa));
      } else if (opcode === 0x1 && (first & 0x80) !== 0) {
        this.onMessage(payload.toString("utf8"));
      }
    }
  }

  private encodeFrame(payload: Buffer, opcode: number): Buffer {
    const length = payload.length;
    if (length < 126) {
      return Buffer.concat([Buffer.from([0x80 | opcode, length]), payload]);
    }
    if (length <= 0xffff) {
      const header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
      return Buffer.concat([header, payload]);
    }
    const header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
    return Buffer.concat([header, payload]);
  }
}

class ChromeBridgeBroker {
  private readonly clients = new Map<string, BridgeClient>();
  private readonly pending = new Map<string, PendingBridgeRequest>();

  constructor() {
    const cleanup = setInterval(() => this.cleanup(), 30_000);
    cleanup.unref();
  }

  register(): RegisterResult {
    const clientId = randomUUID();
    this.clients.set(clientId, { queue: [], lastSeen: Date.now() });
    return { clientId };
  }

  hasClient(clientId: string): boolean {
    return this.clients.has(clientId);
  }

  attachWebSocket(clientId: string, socket: LocalWebSocket): void {
    const client = this.clients.get(clientId);
    if (!client) {
      socket.close();
      return;
    }
    client.socket?.close();
    client.socket = socket;
    client.lastSeen = Date.now();
    closeWaiter(client, { request: null });
    this.flushQueue(client);
  }

  detachWebSocket(clientId: string, socket: LocalWebSocket): void {
    const client = this.clients.get(clientId);
    if (client?.socket === socket) {
      client.socket = undefined;
    }
  }

  receiveWebSocketMessage(clientId: string, raw: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.lastSeen = Date.now();
    try {
      const message = JSON.parse(raw) as unknown;
      if (
        typeof message === "object" &&
        message !== null &&
        (message as { type?: unknown }).type === "keepalive"
      ) {
        return;
      }
      if (
        typeof message !== "object" ||
        message === null ||
        typeof (message as { requestId?: unknown }).requestId !== "string"
      ) {
        throw new Error("WebSocket応答の形式が不正です");
      }
      this.respond(
        clientId,
        (message as { requestId: string }).requestId,
        message as BridgeResponse,
      );
    } catch (error: unknown) {
      logError("WebSocket応答の処理に失敗しました", error);
    }
  }

  poll(clientId: string, response: ServerResponse): void {
    const client = this.clients.get(clientId);
    if (!client) {
      writeJson(response, 404, { error: "Chrome側の接続が見つかりません" });
      return;
    }
    client.lastSeen = Date.now();
    const request = client.queue.shift();
    if (request) {
      writeJson(response, 200, { request });
      return;
    }

    client.waiter = response;
    const timeout = setTimeout(() => {
      if (client.waiter === response) {
        client.waiter = undefined;
        writeJson(response, 200, { request: null });
      }
    }, POLL_TIMEOUT_MS);
    timeout.unref();
    response.on("close", () => {
      clearTimeout(timeout);
      if (client.waiter === response) client.waiter = undefined;
    });
  }

  respond(clientId: string, requestId: string, response: BridgeResponse): void {
    const client = this.clients.get(clientId);
    if (!client) throw new Error("Chrome側の接続が見つかりません");
    client.lastSeen = Date.now();
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    clearTimeout(pending.timer);
    pending.resolve(response);
  }

  request(
    operation: BridgeOperation,
    params: ThreadReadParams | LogSearchParams,
  ): Promise<BridgeResponse> {
    const client = this.getActiveClient();
    if (!client) {
      return Promise.reject(
        new Error(
          "Chrome版ChLensのサービスワーカーが接続していません。拡張機能を有効にしてから再試行してください",
        ),
      );
    }

    const requestId = randomUUID();
    const request: BridgeRequest = { requestId, operation, params };
    client.client.lastSeen = Date.now();
    return new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Chrome側の応答がタイムアウトしました"));
      }, REQUEST_TIMEOUT_MS);
      timer.unref();
      this.pending.set(requestId, { resolve, reject, timer });

      // 応答を受け付ける状態を先に作ってからChromeへ渡す。
      // 変更理由: localhostのポーリング応答は非常に速く返るため、キュー投入を
      // Promise登録より先に行うと、最初の応答だけpendingへ到達せず失われる競合がある。
      this.dispatch(client.client, request);
    });
  }

  private dispatch(client: BridgeClient, request: BridgeRequest): void {
    if (client.socket?.isOpen) {
      try {
        client.socket.send(JSON.stringify(request));
        return;
      } catch (error: unknown) {
        logError("WebSocket要求の送信に失敗しました", error);
      }
    }

    client.queue.push(request);
    if (client.waiter) {
      closeWaiter(client, { request: client.queue.shift() ?? null });
    }
  }

  private flushQueue(client: BridgeClient): void {
    if (!client.socket?.isOpen) return;
    while (client.queue.length > 0) {
      const request = client.queue.shift();
      if (!request) return;
      try {
        client.socket.send(JSON.stringify(request));
      } catch (error: unknown) {
        logError("WebSocketキューの送信に失敗しました", error);
        client.queue.unshift(request);
        return;
      }
    }
  }

  private getActiveClient(): { clientId: string; client: BridgeClient } | null {
    let active: { clientId: string; client: BridgeClient } | null = null;
    for (const [clientId, client] of this.clients) {
      if (!active || client.lastSeen > active.client.lastSeen) {
        active = { clientId, client };
      }
    }
    return active;
  }

  private cleanup(): void {
    const threshold = Date.now() - CLIENT_TIMEOUT_MS;
    for (const [clientId, client] of this.clients) {
      if (client.lastSeen >= threshold) continue;
      closeWaiter(client, { request: null });
      client.socket?.close();
      this.clients.delete(clientId);
    }
  }
}

interface RegisterResult {
  clientId: string;
}

function headerMethod(request: IncomingMessage): string {
  return request.method?.toUpperCase() ?? "GET";
}

async function handleBridgeHttp(
  broker: ChromeBridgeBroker,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = headerMethod(request);
  if (method === "OPTIONS") {
    writeJson(response, 204, {});
    return;
  }
  if (request.url === "/health" && method === "GET") {
    writeJson(response, 200, { ok: true, service: "chlens-mcp" });
    return;
  }
  if (method !== "POST") {
    writeJson(response, 405, { error: "POSTを指定してください" });
    return;
  }

  try {
    const body = await readJson(request);
    switch (request.url) {
      case "/v1/register":
        writeJson(response, 200, broker.register());
        return;
      case "/v1/poll": {
        const clientId = typeof body.clientId === "string" ? body.clientId : "";
        broker.poll(clientId, response);
        return;
      }
      case "/v1/respond": {
        const clientId = typeof body.clientId === "string" ? body.clientId : "";
        const requestId = typeof body.requestId === "string" ? body.requestId : "";
        const bridgeResponse = body.response as BridgeResponse;
        broker.respond(clientId, requestId, bridgeResponse);
        writeJson(response, 200, { ok: true });
        return;
      }
      default:
        writeJson(response, 404, { error: "パスが見つかりません" });
    }
  } catch (error: unknown) {
    logError("HTTP要求の処理に失敗しました", error);
    writeJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}

function rejectWebSocket(socket: Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function handleWebSocketUpgrade(
  broker: ChromeBridgeBroker,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  try {
    const requestUrl = new URL(request.url ?? "", `http://${MCP_BRIDGE_HOST}`);
    if (requestUrl.pathname !== "/v1/ws") {
      rejectWebSocket(socket, "404 Not Found");
      return;
    }
    const clientId = requestUrl.searchParams.get("clientId") ?? "";
    if (!broker.hasClient(clientId)) {
      rejectWebSocket(socket, "404 Not Found");
      return;
    }
    const key = request.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      rejectWebSocket(socket, "400 Bad Request");
      return;
    }
    const accept = createHash("sha1").update(`${key}${WEBSOCKET_GUID}`).digest("base64");
    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "\r\n",
      ].join("\r\n"),
    );
    let connection: LocalWebSocket | null = null;
    connection = new LocalWebSocket(
      socket,
      (message) => broker.receiveWebSocketMessage(clientId, message),
      () => {
        if (connection) broker.detachWebSocket(clientId, connection);
      },
      head,
    );
    if (connection.isOpen) broker.attachWebSocket(clientId, connection);
  } catch (error: unknown) {
    logError("WebSocket接続の初期化に失敗しました", error);
    rejectWebSocket(socket, "400 Bad Request");
  }
}

function rpcError(id: JsonRpcId, code: number, message: string): object {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function debatePrepareParams(value: Record<string, unknown>): DebatePrepareParams {
  const mode = value.mode;
  return {
    ...(typeof value.url === "string" ? { url: value.url } : {}),
    ...(mode === "auto" || mode === "cache" || mode === "refresh" ? { mode } : {}),
    ...(Array.isArray(value.responseNumbers)
      ? { responseNumbers: value.responseNumbers as number[] }
      : {}),
    ...(Array.isArray(value.participantIds)
      ? { participantIds: value.participantIds as string[] }
      : {}),
    ...(typeof value.maxResponses === "number" ? { maxResponses: value.maxResponses } : {}),
    ...(typeof value.contextDepth === "number" ? { contextDepth: value.contextDepth } : {}),
  };
}

async function prepareDebate(
  broker: ChromeBridgeBroker,
  params: Record<string, unknown>,
): Promise<string> {
  const bridgeResponse = await broker.request("read-thread", {
    url: typeof params.url === "string" ? params.url : undefined,
    mode:
      params.mode === "cache" || params.mode === "refresh" || params.mode === "auto"
        ? params.mode
        : "auto",
  });
  if (!bridgeResponse.ok)
    throw new Error(`ChLensから取得できませんでした: ${bridgeResponse.error}`);
  const payload = bridgeResponse.result as BridgeThreadResult;
  if (!payload || typeof payload.toon !== "string") {
    throw new Error("ChLensのスレッド応答にTOONがありません");
  }
  const context = buildDebateContext(decode(payload.toon), debatePrepareParams(params));
  return context.toon;
}

function parseDebateResult(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch (error: unknown) {
    logError("判定結果JSONの解析に失敗しました", error);
    throw new Error("resultには判定結果JSON、またはJSONオブジェクトを指定してください");
  }
}

async function saveDebate(params: Record<string, unknown>): Promise<string> {
  const result = validateDebateResult(parseDebateResult(params.result));
  const formats = normalizeDebateFormats(params.formats);
  const name = typeof params.name === "string" ? params.name : undefined;
  const saved = await saveDebateResult(result, formats, name);
  return JSON.stringify(
    {
      kind: "debate-result",
      directory: saved.directory,
      files: saved.files,
    },
    null,
    2,
  );
}

function toolDefinitions(): object[] {
  return [
    {
      name: "read_thread",
      description:
        "ChLensのログからスレッドを読みます。URLを省略すると現在表示中のスレッドを対象にします。未保存なら自動取得して保存できます。TOONにはレス本文と返信・被返信メタデータが含まれます。",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "5ch互換のスレッドURL。省略時は現在のスレッド" },
          mode: {
            type: "string",
            enum: ["auto", "cache", "refresh"],
            description: "auto=キャッシュ優先、cache=保存済みのみ、refresh=新着取得",
            default: "auto",
          },
          start: { type: "integer", minimum: 1, description: "レス番号の開始" },
          end: { type: "integer", minimum: 1, description: "レス番号の終了" },
          first: { type: "integer", minimum: 1, description: "先頭からのレス数" },
          last: { type: "integer", minimum: 1, description: "末尾からのレス数" },
          popular: { type: "integer", minimum: 1, description: "被返信数の多いレスの件数" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "search_logs",
      description:
        "ChLensに保存されているスレッドログを、スレタイ・本文・URLで検索します。結果はTOONで返します。",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "検索語。省略または空文字で最近のログ" },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        },
        additionalProperties: false,
      },
    },
    {
      name: "prepare_debate",
      description:
        "指定したレス番号または参加者IDを中心に、返信元・返信先を集めて議論判定用のTOONを作ります。" +
        "AIは返された指示とresultSchemaに従って判定JSONを作成してください。固定の二陣営ではなく争点単位で整理します。",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "5ch互換のスレッドURL。省略時は現在のスレッド" },
          mode: {
            type: "string",
            enum: ["auto", "cache", "refresh"],
            default: "auto",
          },
          responseNumbers: {
            type: "array",
            items: { type: "integer", minimum: 1 },
            description: "議論の中心にするレス番号。participantIdsと併用できます",
          },
          participantIds: {
            type: "array",
            items: { type: "string" },
            description: "議論している参加者のID。該当IDのレスをすべて中心にします",
          },
          maxResponses: { type: "integer", minimum: 1, maximum: 240, default: 240 },
          contextDepth: { type: "integer", minimum: 0, maximum: 8, default: 4 },
        },
        additionalProperties: false,
      },
    },
    {
      name: "save_debate_result",
      description:
        "AIが作成した議論判定JSONを検証し、テキスト・JSON・Markdown・SVG・PNGの指定形式でローカル保存します。",
      inputSchema: {
        type: "object",
        required: ["result"],
        properties: {
          result: DEBATE_RESULT_SCHEMA,
          formats: {
            type: "array",
            items: { type: "string", enum: ["json", "markdown", "text", "svg", "png"] },
            description: "保存する形式。省略時は全形式",
          },
          name: {
            type: "string",
            description: "ファイル名のベース。パス区切りは自動的に除去します",
          },
        },
        additionalProperties: false,
      },
    },
  ];
}

function textResult(text: string, isError = false): object {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function resultText(result: BridgeResponse): string {
  if (!result.ok) return `ChLensから取得できませんでした: ${result.error}`;
  const payload = result.result as BridgeThreadResult | { toon: string };
  return payload.toon;
}

async function handleRpc(
  broker: ChromeBridgeBroker,
  request: JsonRpcRequest,
): Promise<object | null> {
  const id = request.id ?? null;
  const method = request.method ?? "";
  if (method === "notifications/initialized" || method.startsWith("notifications/")) {
    return null;
  }
  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        // 実装済みの契約を固定して返し、未対応の新しい版を誤って名乗らない。
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "chlens", version: "0.1.0" },
      },
    };
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: toolDefinitions() } };
  }
  if (method !== "tools/call") {
    return rpcError(id, -32601, `未対応のメソッドです: ${method}`);
  }

  const params = request.params ?? {};
  const name = typeof params.name === "string" ? params.name : "";
  const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
  try {
    if (name === "prepare_debate") {
      return {
        jsonrpc: "2.0",
        id,
        result: textResult(await prepareDebate(broker, args as Record<string, unknown>)),
      };
    }
    if (name === "save_debate_result") {
      return {
        jsonrpc: "2.0",
        id,
        result: textResult(await saveDebate(args as Record<string, unknown>)),
      };
    }

    let operation: BridgeOperation;
    let bridgeParams: ThreadReadParams | LogSearchParams;
    if (name === "read_thread") {
      operation = "read-thread";
      bridgeParams = args as ThreadReadParams;
    } else if (name === "search_logs") {
      operation = "search-logs";
      bridgeParams = args as LogSearchParams;
    } else {
      return { jsonrpc: "2.0", id, result: textResult(`未対応のツールです: ${name}`, true) };
    }

    const bridgeResponse = await broker.request(operation, bridgeParams);
    return {
      jsonrpc: "2.0",
      id,
      result: textResult(resultText(bridgeResponse), !bridgeResponse.ok),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError("MCPツールの処理に失敗しました", error);
    return { jsonrpc: "2.0", id, result: textResult(message, true) };
  }
}

async function main(): Promise<void> {
  const broker = new ChromeBridgeBroker();
  const httpServer = createServer((request, response) => {
    void handleBridgeHttp(broker, request, response);
  });
  httpServer.on("upgrade", (request, socket, head) => {
    handleWebSocketUpgrade(broker, request, socket, head);
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(MCP_BRIDGE_PORT, MCP_BRIDGE_HOST, () => resolve());
  });
  logError(`ローカルブリッジを起動しました: http://${MCP_BRIDGE_HOST}:${MCP_BRIDGE_PORT}`);

  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const rawLine of input) {
    // Windowsのリダイレクト元がUTF-8 BOMを付けても、最初のJSON-RPC要求を捨てない。
    const line = rawLine.replace(/^\uFEFF/, "");
    if (!line.trim()) continue;
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch (error: unknown) {
      process.stdout.write(`${JSON.stringify(rpcError(null, -32700, "JSONを解析できません"))}\n`);
      logError("JSON-RPC要求の解析に失敗しました", error);
      continue;
    }

    try {
      const response = await handleRpc(broker, request);
      if (response != null) process.stdout.write(`${JSON.stringify(response)}\n`);
    } catch (error: unknown) {
      const id = request.id ?? null;
      process.stdout.write(`${JSON.stringify(rpcError(id, -32603, "内部エラー"))}\n`);
      logError("JSON-RPC要求の処理に失敗しました", error);
    }
  }

  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
}

void main().catch((error: unknown) => {
  logError("MCPサーバーを起動できませんでした", error);
  process.exitCode = 1;
});
