import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { WebHttpClient } from "./HttpClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Web試用版のHTTP通信", () => {
  it("取得先と条件付きヘッダーを中継へ渡し、応答の文字列と最終URLを返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("本文", {
        status: 200,
        headers: { etag: '"revision"', "x-chlens-final-url": "https://example.com/final" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await WebHttpClient.fetch("https://example.com/thread", {
      headers: { "If-None-Match": '"old"' },
      mimeType: "text/plain; charset=utf-8",
    });

    const [proxyUrl, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(proxyUrl.pathname).toBe("/__chlens_web_proxy");
    expect(proxyUrl.searchParams.get("url")).toBe("https://example.com/thread");
    expect(options.headers).toEqual({ "If-None-Match": '"old"' });
    expect(response).toMatchObject({
      status: 200,
      body: "本文",
      url: "https://example.com/final",
      headers: { ETag: '"revision"' },
    });
  });

  it("書き込み要求を中継へ送らず拒否する", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(WebHttpClient.fetch("https://example.com/", { method: "POST" })).rejects.toThrow(
      "読み取り専用",
    );
    await expect(WebHttpClient.setupWriteHeaders("https://example.com/")).rejects.toThrow(
      "書き込みに対応していません",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
