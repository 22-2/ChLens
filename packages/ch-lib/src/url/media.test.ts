import { countImageUrlsInMessage, extractImageUrlsFromMessage, toViewerImageUrl } from "./media";
import { describe, expect, it } from "vite-plus/test";

describe("本文メディアURL解析", () => {
  it("画像URLを重複なく抽出し、対応しないメディアを除外する", () => {
    const message = [
      '<a href="https://example.com/first.jpg">画像1</a>',
      '<img src="//example.com/second.png">',
      "https://example.com/first.jpg",
      "https://example.com/video.mp4",
      "https://youtu.be/video",
      "https://imgur.com/a/album-id",
    ].join(" ");

    expect(extractImageUrlsFromMessage(message)).toEqual([
      "https://example.com/first.jpg",
      "https://example.com/second.png",
    ]);
    expect(countImageUrlsInMessage(message)).toBe(2);
  });

  it("Imgur単体画像とTwitterのformat指定を画像として扱う", () => {
    expect(toViewerImageUrl("https://imgur.com/SingleImage")).toBe(
      "https://i.imgur.com/SingleImagem.jpg",
    );
    expect(toViewerImageUrl("https://pbs.twimg.com/media/Image?format=jpg&name=large")).toBe(
      "https://pbs.twimg.com/media/Image?format=jpg&name=large",
    );
    expect(toViewerImageUrl("https://imgur.com/a/Album")).toBeNull();
  });
});
