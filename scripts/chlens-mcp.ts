import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createInterface } from "node:readline";

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
        new Error("Chrome版ChLensが起動していません。ChLensの画面を開いてから再試行してください"),
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
      client.client.queue.push(request);
      if (client.client.waiter) {
        closeWaiter(client.client, { request: client.client.queue.shift() ?? null });
      }
    });
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

function rpcError(id: JsonRpcId, code: number, message: string): object {
  return { jsonrpc: "2.0", id, error: { code, message } };
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
