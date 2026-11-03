import "@testing-library/jest-dom/vitest";

import {
  hasExternalLink,
  hasImage,
  hasInternalLink,
  hasVideo,
  siteDomainOf,
} from "src/view/browser/utils/message-filter";
import { describe, expect, it } from "vite-plus/test";

describe("message-filter", () => {
  it("twitter 画像URLを画像として判定する", () => {
    const url = "https://pbs.twimg.com/media/TestTwitterImage?format=jpg&name=large";

    expect(hasImage(url)).toBe(true);
  });

  it("twitter画像のコロン付きサイズ指定URLを画像として判定する", () => {
    // なぜ判定が必要か: pbs.twimg.com の「XXX.jpg:orig」形式はコロン以下を拡張子と誤認すると画像判定から漏れるため。
    expect(hasImage("https://pbs.twimg.com/media/TestTwitterImageA.jpg:orig")).toBe(true);
    expect(hasImage("https://pbs.twimg.com/media/TestTwitterImageB.jpg:large")).toBe(true);
    expect(hasImage("https://pbs.twimg.com/media/TestTwitterImageC.png:orig")).toBe(true);
    expect(hasImage("s://pbs.twimg.com/media/TestTwitterImageD.jpg:orig")).toBe(true);
    expect(hasImage("https://example.com/notimage.txt:orig")).toBe(false);
  });

  it("先頭を削った画像URLをリンク・画像として扱う", () => {
    const message = [
      "s://pbs.twimg.com/media/TestTwitterImageA.jpg",
      "ps://pbs.twimg.com/media/TestTwitterImageB.jpg",
      "p://i.imgur.com/TestImageC.jpg",
    ].join(" ");

    expect(hasExternalLink(message)).toBe(true);
    expect(hasImage(message)).toBe(true);
  });

  it("プロトコルが欠けたURLを含む本文でも例外を投げず、画像・動画を判定する", () => {
    // なぜ判定が必要か: 「://」で始まるURLは補完時に fallbackProtocol を参照する。
    // URL変換の関数をそのまま replace に渡すと、第2引数に文字位置が入って例外になり、
    // レスの描画全体が止まるため、URLだけを渡して判定する。
    const message = "見て ://pbs.twimg.com/media/TestTwitterImageE.jpg と ://youtu.be/TestVideo02";

    expect(() => hasImage(message)).not.toThrow();
    expect(hasImage(message)).toBe(true);
    expect(hasVideo(message)).toBe(true);
  });

  it("YouTube と直リンク mp4 を動画として判定する", () => {
    expect(hasVideo("https://youtu.be/TestVideo01")).toBe(true);
    expect(
      hasVideo(
        "https://video.twimg.com/amplify_video/0000000000000000000/vid/avc1/1280x720/test-video.mp4?tag=14",
      ),
    ).toBe(true);
  });
});

describe("リンクの内外の判定", () => {
  const threadUrl = "https://mi.5ch.io/test/read.cgi/news/1234567890/";

  it("スレッドと同じサイトのリンクだけなら内部リンクで、外部リンクには数えない", () => {
    const message = "https://itest.5ch.io/test/read.cgi/news/1111111111/";

    expect(hasInternalLink(message, threadUrl)).toBe(true);
    expect(hasExternalLink(message, threadUrl)).toBe(false);
  });

  it("別のサイトへのリンクは外部リンクで、内部リンクには数えない", () => {
    const message = "https://example.com/page";

    expect(hasExternalLink(message, threadUrl)).toBe(true);
    expect(hasInternalLink(message, threadUrl)).toBe(false);
  });

  it("内外のリンクが混ざっていれば、どちらにも当てはまる", () => {
    const message = "https://example.com/a https://mi.5ch.io/test/read.cgi/news/2/";

    expect(hasExternalLink(message, threadUrl)).toBe(true);
    expect(hasInternalLink(message, threadUrl)).toBe(true);
  });

  it("スレッドのURLを渡さないときの外部リンクは、従来どおりリンクがあれば当てはまる", () => {
    expect(hasExternalLink("https://mi.5ch.io/test/read.cgi/news/2/")).toBe(true);
    expect(hasExternalLink("リンクなし")).toBe(false);
  });

  it("co.jp のような第2レベルは、別の組織を同じサイトとみなさない", () => {
    expect(siteDomainOf("www.example.co.jp")).toBe("example.co.jp");
    expect(siteDomainOf("a.example.co.jp")).not.toBe(siteDomainOf("a.other.co.jp"));
    expect(siteDomainOf("mi.5ch.io")).toBe("5ch.io");
  });
});
