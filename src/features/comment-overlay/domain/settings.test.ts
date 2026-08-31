import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_COMMENT_OVERLAY_SETTINGS, normalizeCommentOverlaySettings } from "./settings";

describe("コメントOverlay設定", () => {
  it("未設定値は既定値へ戻す", () => {
    expect(normalizeCommentOverlaySettings(undefined)).toEqual(DEFAULT_COMMENT_OVERLAY_SETTINGS);
  });

  it("設定値を許容範囲へ丸める", () => {
    expect(
      normalizeCommentOverlaySettings({
        durationSeconds: 1,
        fontSize: 1,
        opacity: -1,
        maxQueueSize: 12.6,
      }),
    ).toEqual({
      durationSeconds: 2,
      fontSize: 10,
      opacity: 0.1,
      maxQueueSize: 13,
    });
  });

  it("NaNや無限大を既定値へ戻す", () => {
    expect(
      normalizeCommentOverlaySettings({
        durationSeconds: Number.NaN,
        fontSize: Number.POSITIVE_INFINITY,
        opacity: Number.NEGATIVE_INFINITY,
        maxQueueSize: Number.NaN,
      }),
    ).toEqual(DEFAULT_COMMENT_OVERLAY_SETTINGS);
  });
});
