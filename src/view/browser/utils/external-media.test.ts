import {
  getDirectVideoLabel,
  isDirectVideoUrl,
  toInlineVideoEmbed,
} from "src/view/browser/utils/external-media";
import { describe, expect, it } from "vitest";

describe("external media", () => {
  it("YouTube URL をレス内埋め込み向けURLへ変換する", () => {
    const media = toInlineVideoEmbed("https://youtu.be/TestVideo01?t=3");

    expect(media).not.toBeNull();
    expect(media?.provider).toBe("youtube");
    expect(media?.embedUrl).toContain(
      "https://www.youtube-nocookie.com/embed/TestVideo01",
    );
    expect(media?.thumbnailUrl).toBe(
      "https://img.youtube.com/vi/TestVideo01/hqdefault.jpg",
    );
  });

  it("video.twimg.com の直リンクをネイティブ動画として判定する", () => {
    const rawUrl =
      "https://video.twimg.com/amplify_video/0000000000000000000/vid/avc1/1280x720/test-video.mp4?tag=14";

    expect(isDirectVideoUrl(rawUrl)).toBe(true);
    expect(getDirectVideoLabel(rawUrl)).toBe("Twitter Video");
  });
});
