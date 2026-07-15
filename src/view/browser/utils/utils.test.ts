import "@testing-library/jest-dom/vitest";
import {
  hasImage,
  hasVideo,
  normalizeIdLinkText,
  stripHtml,
  toViewerImageUrl,
} from "src/view/browser/utils/utils";
import { describe, expect, it } from "vite-plus/test";

describe("browser utils", () => {
  it("stripHtml は数値文字参照の絵文字を復元する", () => {
    expect(stripHtml("<span>&#128514;</span><br>&amp;test")).toBe("😂\n&test");
  });

  it("twitter 画像URLをビューア向けURLとして扱う", () => {
    const url = "https://pbs.twimg.com/media/TestTwitterImage?format=jpg&name=large";

    expect(toViewerImageUrl(url)).toBe(url);
    expect(hasImage(url)).toBe(true);
  });

  it("YouTube と直リンク mp4 を動画として判定する", () => {
    expect(hasVideo("https://youtu.be/TestVideo01")).toBe(true);
    expect(
      hasVideo(
        "https://video.twimg.com/amplify_video/0000000000000000000/vid/avc1/1280x720/test-video.mp4?tag=14",
      ),
    ).toBe(true);
  });

  it("anchor_id の表示文字列をIDポップアップ向けに正規化する", () => {
    expect(normalizeIdLinkText("id:ABC123(4)")).toBe("ID:ABC123");
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
      expect(toViewerImageUrl("https://m.imgur.com/TestID")).toBe(
        "https://i.imgur.com/TestIDm.jpg",
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
});
