export interface CommentOverlaySettings {
  /** コメントがステージへ入ってから出るまでの基準時間。単位は秒。 */
  durationSeconds: number;
  /** Overlay上のコメント文字サイズ。単位はpx。 */
  fontSize: number;
  /** コメントの不透明度。0から1の範囲。 */
  opacity: number;
  /** strict/queue時に待機させるコメント数の上限。 */
  maxQueueSize: number;
}

export const MIN_COMMENT_OVERLAY_DURATION_SECONDS = 2;
export const MAX_COMMENT_OVERLAY_DURATION_SECONDS = 15;

export const DEFAULT_COMMENT_OVERLAY_SETTINGS: Readonly<CommentOverlaySettings> = {
  durationSeconds: 6,
  fontSize: 30,
  opacity: 0.95,
  maxQueueSize: 64,
};

/** 設定画面や古いeventから来た値を、schedulerが安全に扱える範囲へ揃える。 */
export function normalizeCommentOverlaySettings(
  input: Partial<CommentOverlaySettings> | null | undefined,
): CommentOverlaySettings {
  return {
    durationSeconds: clampFinite(
      input?.durationSeconds,
      MIN_COMMENT_OVERLAY_DURATION_SECONDS,
      MAX_COMMENT_OVERLAY_DURATION_SECONDS,
      DEFAULT_COMMENT_OVERLAY_SETTINGS.durationSeconds,
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
