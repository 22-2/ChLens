import "@testing-library/jest-dom/vitest";
import {
  extractUrlsFromMessage,
  toOriginalImageUrl,
  toViewerImageUrl,
} from "src/view/browser/utils/url-media";
import { describe, expect, it } from "vite-plus/test";

describe("url-media", () => {
  it("先頭を削ったURLを復元して重複なく抽出する", () => {
    const message = [
      "s://pbs.twimg.com/media/TestTwitterImageA.jpg",
      "ps://pbs.twimg.com/media/TestTwitterImageB.jpg",
      "p://i.imgur.com/TestImageC.jpg",
    ].join(" ");

    expect(extractUrlsFromMessage(message)).toEqual([
      "https://pbs.twimg.com/media/TestTwitterImageA.jpg",
      "https://pbs.twimg.com/media/TestTwitterImageB.jpg",
      "http://i.imgur.com/TestImageC.jpg",
    ]);
  });

  it("twitter画像URLをビューア向けURLとして扱う", () => {
    const url = "https://pbs.twimg.com/media/TestTwitterImage?format=jpg&name=large";

    expect(toViewerImageUrl(url)).toBe(url);
  });

  it("先頭を削ったimgur画像URLをサムネイル形式に変換する", () => {
    expect(toViewerImageUrl("p://i.imgur.com/TestImageC.jpg")).toBe(
      "https://i.imgur.com/TestImageCm.jpg",
    );
  });

  describe("imgur URL変換（リサイズパラメータ付き）", () => {
    it("imgur.com/[id] をサムネイル形式に変換する", () => {
      expect(toViewerImageUrl("https://imgur.com/TestImage")).toBe(
        "https://i.imgur.com/TestImagem.jpg",
      );
    });

    it("imgur.com/[id]/ （末尾スラッシュあり）をサムネイル形式に変換する", () => {
      expect(toViewerImageUrl("https://imgur.com/TestImage/")).toBe(
        "https://i.imgur.com/TestImagem.jpg",
      );
    });

    it("imgur.com/a/[album_id] は画像URLへ変換しない", () => {
      expect(toViewerImageUrl("https://imgur.com/a/TestAlbum")).toBeNull();
    });

    it("m.imgur.com/[id] をサムネイル形式に変換する", () => {
      expect(toViewerImageUrl("https://m.imgur.com/TestImage")).toBe(
        "https://i.imgur.com/TestImagem.jpg",
      );
    });

    it("既存の i.imgur.com 画像にリサイズパラメータを追加する", () => {
      expect(toViewerImageUrl("https://i.imgur.com/TestImage.jpg")).toBe(
        "https://i.imgur.com/TestImagem.jpg",
      );
    });

    it("i.imgur.com の png 画像にもリサイズパラメータを追加する", () => {
      expect(toViewerImageUrl("https://i.imgur.com/TestImage.png")).toBe(
        "https://i.imgur.com/TestImagem.png",
      );
    });

    it("末尾スラッシュと拡張子を含むURLを処理する", () => {
      expect(toViewerImageUrl("https://imgur.com/TestImage.jpg/")).toBe(
        "https://i.imgur.com/TestImagem.jpg",
      );
    });
  });

  it("imgurのサムネイルURLからオリジナルURLを復元する", () => {
    expect(toOriginalImageUrl("https://i.imgur.com/TestImagem.jpg")).toBe(
      "https://i.imgur.com/TestImage.jpg",
    );
    expect(toOriginalImageUrl("https://i.imgur.com/TestImage.jpg")).toBeNull();
  });
});
