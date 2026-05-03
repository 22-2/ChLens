import "@testing-library/jest-dom/vitest";
import {
  hasVideo,
  hasImage,
  normalizeIdLinkText,
  stripHtml,
  toViewerImageUrl,
} from "src/view/browser/utils/utils";
import { describe, expect, it } from "vitest";

describe("browser utils", () => {
  it("stripHtml は数値文字参照の絵文字を復元する", () => {
    expect(stripHtml("<span>&#128514;</span><br>&amp;test")).toBe("😂\n&test");
  });

  it("twitter 画像URLをビューア向けURLとして扱う", () => {
    const url =
      "https://pbs.twimg.com/media/TestTwitterImage?format=jpg&name=large";

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
});
