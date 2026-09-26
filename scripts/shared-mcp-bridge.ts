import { randomUUID } from "node:crypto";
import { createServer, request as httpRequest, type ServerResponse } from "node:http";

import type { BridgeRequest, BridgeResponse } from "../src/mcp/protocol.ts";
import { MCP_BRIDGE_HOST, MCP_BRIDGE_PORT } from "../src/mcp/protocol.ts";

export interface BridgeRequester {
  request(
    operation: BridgeRequest["operation"],
    params: BridgeRequest["params"],
  ): Promise<BridgeResponse>;
}

type BridgeService = {
  server: ReturnType<typeof createServer>;
  broker: BridgeRequester & { close(): void };
};

/** チャットのstdio寿命とChromeブリッジの寿命を分離し、最後の利用者まで待受を保持する。 */
export function createSharedBridge(
  createService: () => BridgeService,
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
        // TCPの切断を利用するため、強制終了でも参照数やPIDファイルが残らない。
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

  async function startOwner(): Promise<void> {
    const { server, broker } = createService();
    const sessions = new Map<string, ServerResponse>();
    let idleTimer: ReturnType<typeof setTimeout>;
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
      // 同時起動したチャットの接続が届く猶予を設け、利用者ゼロなら常駐を終了する。
      idleTimer = setTimeout(() => {
        if (sessions.size === 0) stop();
      }, 1000);
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
              .end(
                JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
              );
          }
        })();
        return;
      }
      for (const handler of originalHandlers) handler.call(server, request, response);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        // 排他的bindを起動競合の判定に使い、敗者は勝者のブリッジへ接続する。
        server.listen({ host: MCP_BRIDGE_HOST, port: MCP_BRIDGE_PORT, exclusive: true }, () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
      server.on("error", (error) => {
        console.error("[ChLens MCP] 共有ブリッジのエラー", error);
        stop();
      });
      scheduleStop();
      console.error(`[ChLens MCP] 共有ブリッジを起動しました: ${baseUrl}`);
    } catch (error) {
      broker.close();
      server.close();
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }

  async function ensureConnected(): Promise<void> {
    if (closed) throw new Error("MCPセッションは終了しています");
    if (session) return;
    connecting ??= (async () => {
      await startOwner();
      await connect();
    })().finally(() => {
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
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(50_000)]),
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
