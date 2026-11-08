// @vitest-environment node
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { handleWebPreviewProxy } from "../../scripts/web-preview-proxy";

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((request, response) => void handleWebPreviewProxy(request, response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

afterEach(() => vi.restoreAllMocks());

function send(target: string, options: { method?: string; headers?: Record<string, string> } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path: `/?url=${encodeURIComponent(target)}`, ...options },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (part: string) => {
          body += part;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("Web試用版の読み取り専用中継", () => {
  it("対応掲示板の応答を返す", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("内容", { status: 200 }));
    const response = await send("https://example.5ch.io/test");
    expect(response).toEqual({ status: 200, body: "内容" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("掲示板以外やPOST、外部オリジンからの要求を拒否する", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await send("http://127.0.0.1/")).status).toBe(502);
    expect((await send("https://example.5ch.io/", { method: "POST" })).status).toBe(405);
    expect(
      (await send("https://example.5ch.io/", { headers: { origin: "https://example.com" } }))
        .status,
    ).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("対応掲示板から外部へのリダイレクトを拒否する", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }),
      );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await send("https://example.5ch.io/")).status).toBe(502);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
