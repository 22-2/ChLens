import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { createServer, request as httpRequest, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BridgeRequest, BridgeResponse } from "../src/mcp/protocol.ts";
import { MCP_BRIDGE_HOST, MCP_BRIDGE_PORT } from "../src/mcp/protocol.ts";

export interface BridgeRequester {
  request(
    operation: BridgeRequest["operation"],
    params: BridgeRequest["params"],
  ): Promise<BridgeResponse>;
}

/** ブリッジの待受を担当する切り離しプロセスを起動するときの引数。 */
export const DAEMON_FLAG = "--daemon";

// 利用者がいなくなってから待受を終了するまでの猶予。チャットの切り替え間と、
// Chrome拡張の再接続周期（最大数十秒）を覆う長さにする。
const IDLE_STOP_MS = 5 * 60_000;
// 応答待ち(Chrome接続待ち30秒＋処理45秒)を打ち切らない長さにする。
const SHARED_REQUEST_TIMEOUT_MS = 80_000;
const DAEMON_START_TIMEOUT_MS = 10_000;
const DAEMON_RETRY_INTERVAL_MS = 200;

type BridgeService = {
  server: ReturnType<typeof createServer>;
  broker: BridgeRequester & { close(): void };
};

function isConnectionRefused(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ECONNREFUSED";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chromeブリッジの待受プロセス（切り離して動く）。
 *
 * 変更理由: 待受が最初に起動したチャットのプロセス内にいると、そのチャットの終了と同時に
 * 消えてしまい、Chrome拡張の登録失敗やタイムアウトを招いていた。待受を独立プロセスに
 * 分け、利用者が全員いなくなってから一定時間（IDLE_STOP_MS）後に自分で終了する。
 */
export async function runBridgeDaemon(createService: () => BridgeService): Promise<void> {
  const { server, broker } = createService();
  const sessions = new Map<string, ServerResponse>();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    clearTimeout(idleTimer);
    broker.close();
    server.close();
    server.closeAllConnections();
  };
  const scheduleStop = (): void => {
    if (stopping) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (sessions.size === 0) stop();
    }, IDLE_STOP_MS);
  };

  const originalHandlers = server.listeners("request");
  server.removeAllListeners("request");
  server.on("request", (request, response) => {
    if (request.url === "/v1/mcp/session" && request.method === "GET") {
      // ブラウザのページが共有セッションを作らないよう、Origin付きの要求を拒否する。
      if (request.headers.origin || stopping) {
        response.writeHead(403).end();
        return;
      }
      const id = randomUUID();
      clearTimeout(idleTimer);
      sessions.set(id, response);
      response.writeHead(200, {
        "X-ChLens-Session": id,
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.flushHeaders();
      // TCPの切断を利用するため、チャットが強制終了しても参照が残らない。
      response.on("close", () => {
        sessions.delete(id);
        if (sessions.size === 0) scheduleStop();
      });
      return;
    }
    if (request.url === "/v1/mcp/request") {
      const id = request.headers["x-chlens-session"];
      if (
        request.method !== "POST" ||
        request.headers.origin ||
        typeof id !== "string" ||
        !sessions.has(id)
      ) {
        response.writeHead(403).end();
        return;
      }
      void (async () => {
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of request) {
            size += chunk.length;
            if (size > 8 * 1024 * 1024) throw new Error("共有要求が大きすぎます");
            chunks.push(Buffer.from(chunk));
          }
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as BridgeRequest;
          const result = await broker.request(body.operation, body.params);
          response
            .writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify(result));
        } catch (error) {
          console.error("[ChLens MCP] 共有要求の処理に失敗しました", error);
          response
            .writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      })();
      return;
    }
    for (const handler of originalHandlers) handler.call(server, request, response);
  });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      // 排他的bindを起動競合の判定に使い、敗者は何もせず終了する。
      server.listen({ host: MCP_BRIDGE_HOST, port: MCP_BRIDGE_PORT, exclusive: true }, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
  } catch (error) {
    broker.close();
    server.close();
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      console.error("[ChLens MCP] 共有ブリッジは既に起動しています");
      return;
    }
    throw error;
  }
  server.on("error", (error) => {
    console.error("[ChLens MCP] 共有ブリッジのエラー", error);
    stop();
  });
  scheduleStop();
  console.error(
    `[ChLens MCP] 共有ブリッジを起動しました: http://${MCP_BRIDGE_HOST}:${MCP_BRIDGE_PORT}`,
  );
}

/** 待受プロセスをチャットから切り離して起動する。ログはtmpのファイルへ残す。 */
function spawnDaemon(scriptPath: string): void {
  const dir = join(tmpdir(), "chlens-mcp");
  mkdirSync(dir, { recursive: true });
  const logFd = openSync(join(dir, "daemon.log"), "a");
  try {
    const child = spawn(process.execPath, ["--experimental-strip-types", scriptPath, DAEMON_FLAG], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
    });
    child.on("error", (error) =>
      console.error("[ChLens MCP] 共有ブリッジの起動に失敗しました", error),
    );
    child.unref();
  } finally {
    closeSync(logFd);
  }
}

/**
 * 待受プロセスの利用者側。未起動なら切り離して起動し、接続する。
 * チャットのstdio寿命とChromeブリッジの寿命は独立している。
 */
export function createSharedBridge(
  scriptPath: string = fileURLToPath(new URL("./chlens-mcp.ts", import.meta.url)),
): BridgeRequester & { ready(): Promise<void>; close(): void } {
  const baseUrl = `http://${MCP_BRIDGE_HOST}:${MCP_BRIDGE_PORT}`;
  let closed = false;
  let session: { id: string; close(): void } | undefined;
  let connecting: Promise<void> | undefined;
  const lifetime = new AbortController();

  async function connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const request = httpRequest(`${baseUrl}/v1/mcp/session`, { agent: false }, (response) => {
        const id = response.headers["x-chlens-session"];
        if (response.statusCode !== 200 || typeof id !== "string") {
          response.destroy();
          reject(
            new Error(
              "共有に未対応のサーバーが起動中です。旧ChLens MCPを終了してCodexを再起動してください",
            ),
          );
          return;
        }
        request.setTimeout(0);
        const current = { id, close: () => response.destroy() };
        session = current;
        response.on("close", () => {
          if (session === current) session = undefined;
        });
        response.on("error", (error) =>
          console.error("[ChLens MCP] 共有接続が切断されました", error),
        );
        response.resume();
        if (closed) current.close();
        resolve();
      });
      request.on("error", reject);
      request.setTimeout(3000, () =>
        request.destroy(new Error("共有ブリッジへの接続がタイムアウトしました")),
      );
      request.end();
    });
  }

  async function connectOrStartDaemon(): Promise<void> {
    try {
      await connect();
      return;
    } catch (error) {
      if (!isConnectionRefused(error)) throw error;
    }
    spawnDaemon(scriptPath);
    const deadline = Date.now() + DAEMON_START_TIMEOUT_MS;
    for (;;) {
      await sleep(DAEMON_RETRY_INTERVAL_MS);
      try {
        await connect();
        return;
      } catch (error) {
        if (!isConnectionRefused(error) || Date.now() > deadline) throw error;
      }
    }
  }

  async function ensureConnected(): Promise<void> {
    if (closed) throw new Error("MCPセッションは終了しています");
    if (session) return;
    connecting ??= connectOrStartDaemon().finally(() => {
      connecting = undefined;
    });
    await connecting;
    if (closed) throw new Error("MCPセッションは終了しています");
  }

  return {
    ready: ensureConnected,
    async request(operation, params) {
      await ensureConnected();
      // 応答途中で切断された操作は二重実行を避けて再送せず、次の呼び出しで再接続する。
      const response = await fetch(`${baseUrl}/v1/mcp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-ChLens-Session": session!.id },
        body: JSON.stringify({ operation, params }),
        // stdio切断後にHTTP応答待ちだけがプロセスを延命しないよう中断する。
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(SHARED_REQUEST_TIMEOUT_MS)]),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `共有ブリッジがHTTP ${response.status}を返しました`);
      }
      return (await response.json()) as BridgeResponse;
    },
    close() {
      closed = true;
      lifetime.abort();
      session?.close();
      session = undefined;
    },
  };
}
