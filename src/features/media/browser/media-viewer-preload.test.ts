import { listPreloadUrls } from "src/features/media/browser/media-viewer-preload";
import { describe, expect, it } from "vite-plus/test";

const urls = [1, 2, 3, 4, 5].map((n) => `https://example.com/${n}.jpg`);

describe("ビューアの先読み対象", () => {
  it("次の2枚を先にし、前の1枚を最後に返す", () => {
    expect(listPreloadUrls(urls, 2)).toEqual([urls[3], urls[4], urls[1]]);
  });

  it("端では存在しない側を含めない", () => {
    expect(listPreloadUrls(urls, 0)).toEqual([urls[1], urls[2]]);
    expect(listPreloadUrls(urls, 4)).toEqual([urls[3]]);
  });

  it("画像として表示できないURLは含めない", () => {
    const mixed = [urls[0]!, "https://example.com/page.html", urls[2]!, urls[3]!];
    // 先読みの範囲は位置で決まるため、表示できないURLの分だけ件数が減る。
    expect(listPreloadUrls(mixed, 0)).toEqual([urls[2]]);
  });

  it("画像一覧がないとき、または位置が不明なときは空にする", () => {
    expect(listPreloadUrls(undefined, 0)).toEqual([]);
    expect(listPreloadUrls(urls, undefined)).toEqual([]);
  });
});
