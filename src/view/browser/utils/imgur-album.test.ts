import { describe, expect, it, vi } from "vite-plus/test";
import { ImgurAlbumResolver, normalizeImgurImageUrl } from "src/view/browser/utils/imgur-album";

const ALBUM_URL = "https://imgur.com/a/1m6jk1F";
const THREAD_URL = "https://bbs.example.test/test/read.cgi/live/123/";

describe("Imgur album resolver", () => {
  it("Imgur画像URLをhttpsのi.imgur.com形式へ正規化し、拡張子を補完する", () => {
    expect(normalizeImgurImageUrl("http://imgur.com/cicrbsg")).toBe(
      "https://i.imgur.com/cicrbsg.png",
    );
    expect(normalizeImgurImageUrl("https://i.imgur.com/cicrbsg.jpeg")).toBe(
      "https://i.imgur.com/cicrbsg.jpeg",
    );
    expect(normalizeImgurImageUrl("https://example.test/image.jpg")).toBeNull();
  });

  it("アルバム内の画像リンクを順序どおり取得し、キャッシュする", async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        data: [{ link: "https://i.imgur.com/first.jpeg" }, { link: "http://imgur.com/second" }],
      }),
    });
    const resolver = new ImgurAlbumResolver({
      fetch,
      getClientId: () => "default-client",
      getAccessToken: () => null,
    });

    await expect(resolver.resolve(ALBUM_URL, THREAD_URL)).resolves.toEqual([
      "https://i.imgur.com/first.jpeg",
      "https://i.imgur.com/second.png",
    ]);
    await expect(resolver.resolve(ALBUM_URL, THREAD_URL)).resolves.toEqual([
      "https://i.imgur.com/first.jpeg",
      "https://i.imgur.com/second.png",
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://api.imgur.com/3/album/1m6jk1F/images", {
      Authorization: "Client-ID default-client",
    });
  });

  it("アクセストークンを優先し、失敗したスレッドでは再試行せず別スレッドでは試行する", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValue({
        status: 200,
        body: JSON.stringify({ data: [{ link: "https://i.imgur.com/cicrbsg.jpeg" }] }),
      });
    const logError = vi.fn();
    const resolver = new ImgurAlbumResolver({
      fetch,
      getClientId: () => "default-client",
      getAccessToken: () => "user-token",
      logError,
    });

    await expect(resolver.resolve(ALBUM_URL, THREAD_URL)).resolves.toBeNull();
    await expect(resolver.resolve(ALBUM_URL, THREAD_URL)).resolves.toBeNull();
    await expect(
      resolver.resolve(ALBUM_URL, "https://bbs.example.test/other-thread/"),
    ).resolves.toEqual(["https://i.imgur.com/cicrbsg.jpeg"]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[1]).toEqual({ Authorization: "Bearer user-token" });
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
