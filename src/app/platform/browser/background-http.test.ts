// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/app/platform/browser/user-agent-rule", () => ({
  applyUserAgentRule: vi.fn(async () => {}),
}));

import { handleSharedHttpRequest } from "./background-http";

describe("拡張機能全ウィンドウ共有HTTPキュー", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("別ウィンドウからの要求も同じ同時実行数と待ち行列上限を使う", async () => {
    let activeCount = 0;
    let maximumActiveCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      activeCount += 1;
      maximumActiveCount = Math.max(maximumActiveCount, activeCount);
      await Promise.resolve();
      activeCount -= 1;
      return {
        status: 200,
        headers: new Headers({ "content-type": "text/plain", etag: "test-etag" }),
        arrayBuffer: async () => new TextEncoder().encode(url).buffer,
        url,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const requests = Array.from({ length: 100 }, (_, index) =>
      handleSharedHttpRequest({
        type: "shared-http-request",
        url: "https://example.com/" + index,
        sourceWindow: index % 2,
      }),
    );
    const results = await Promise.all(requests);

    expect(maximumActiveCount).toBeLessThanOrEqual(3);
    expect(fetchMock).toHaveBeenCalledTimes(13);
    expect(results.filter((result) => result?.ok)).toHaveLength(13);
    expect(results.filter((result) => result?.ok === false)).toHaveLength(87);
    expect(results[0]).toMatchObject({
      ok: true,
      response: { headers: { ETag: "test-etag" } },
    });
  });

  it("ウィンドウから渡されたHTTPSのみの方針では、HTTPSに失敗してもHTTPで再試行しない", async () => {
    const fetchMock = vi.fn(async (_url: string) => {
      throw new TypeError("TLS接続失敗");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleSharedHttpRequest({
      type: "shared-http-request",
      url: "http://example.net/board/",
      options: { httpsMode: "https_only" },
    });

    expect(result).toMatchObject({ ok: false });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://example.net/board/",
      expect.anything(),
    );
  });

  it("画像のバイナリ応答を文字列へ変換せずBase64で渡す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        status: 200,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: async () => new Uint8Array([0, 255, 137, 80]).buffer,
        url,
      })),
    );

    await expect(
      handleSharedHttpRequest({
        type: "shared-http-request",
        url: "https://example.com/image.png",
        responseType: "binary",
      }),
    ).resolves.toMatchObject({
      ok: true,
      responseType: "binary",
      response: { bodyBase64: "AP+JUA==", headers: { "content-type": "image/png" } },
    });
  });

  it("共有対象外のメッセージは処理しない", async () => {
    await expect(
      handleSharedHttpRequest({ type: "open-new-ui", url: "about:blank" }),
    ).resolves.toBe(undefined);
  });
});
