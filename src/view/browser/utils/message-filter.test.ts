import "@testing-library/jest-dom/vitest";
import { hasExternalLink, hasImage, hasVideo } from "src/view/browser/utils/message-filter";
import { describe, expect, it } from "vite-plus/test";

describe("message-filter", () => {
  it("twitter 画像URLを画像として判定する", () => {
    const url = "https://pbs.twimg.com/media/TestTwitterImage?format=jpg&name=large";

    expect(hasImage(url)).toBe(true);
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

  it("YouTube と直リンク mp4 を動画として判定する", () => {
    expect(hasVideo("https://youtu.be/TestVideo01")).toBe(true);
    expect(
      hasVideo(
        "https://video.twimg.com/amplify_video/0000000000000000000/vid/avc1/1280x720/test-video.mp4?tag=14",
      ),
    ).toBe(true);
  });
});
