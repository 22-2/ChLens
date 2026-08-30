export interface CommentOverlaySettings {
  /** コメントがステージを通過する基準速度。単位はpx/sec。 */
  baseSpeedPxPerSecond: number;
  /** Overlay上のコメント文字サイズ。単位はpx。 */
  fontSize: number;
  /** コメントの不透明度。0から1の範囲。 */
  opacity: number;
  /** strict/queue時に待機させるコメント数の上限。 */
  maxQueueSize: number;
}

export const DEFAULT_COMMENT_OVERLAY_SETTINGS: Readonly<CommentOverlaySettings> = {
  baseSpeedPxPerSecond: 90,
  fontSize: 18,
  opacity: 0.95,
  maxQueueSize: 64,
};

/** 設定画面や古いeventから来た値を、schedulerが安全に扱える範囲へ揃える。 */
export function normalizeCommentOverlaySettings(
  input: Partial<CommentOverlaySettings> | null | undefined,
): CommentOverlaySettings {
  return {
    baseSpeedPxPerSecond: clampFinite(
      input?.baseSpeedPxPerSecond,
      20,
      600,
      DEFAULT_COMMENT_OVERLAY_SETTINGS.baseSpeedPxPerSecond,
    ),
    fontSize: clampFinite(input?.fontSize, 10, 48, DEFAULT_COMMENT_OVERLAY_SETTINGS.fontSize),
    opacity: clampFinite(input?.opacity, 0.1, 1, DEFAULT_COMMENT_OVERLAY_SETTINGS.opacity),
    maxQueueSize: clampInteger(
      input?.maxQueueSize,
      0,
      3_000,
      DEFAULT_COMMENT_OVERLAY_SETTINGS.maxQueueSize,
    ),
  };
}

function clampFinite(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, minimum), maximum);
}

function clampInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return Math.round(clampFinite(value, minimum, maximum, fallback));
}
