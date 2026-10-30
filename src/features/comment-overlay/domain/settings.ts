export interface CommentOverlaySettings {
  /** コメントがステージへ入ってから出るまでの基準時間。単位は秒。 */
  durationSeconds: number;
  /** コメント文字の不透明度。0.1から1の範囲。 */
  commentOpacity: number;
  /** 流れる画像の不透明度。0.1から1の範囲。 */
  imageOpacity: number;
  /** strict/queue時に待機させるコメント数の上限。 */
  maxQueueSize: number;
  /** コメント実況だけで候補スレを並行取得し、本流確定後に非本流を除外する。 */
  fetchAllCandidateThreads?: boolean;
}

export const MIN_COMMENT_OVERLAY_OPACITY = 0.1;
export const MIN_COMMENT_OVERLAY_DURATION_SECONDS = 2;
export const MAX_COMMENT_OVERLAY_DURATION_SECONDS = 15;

// 変更理由: 通過時間・待機queue上限は設定画面から外し、常にこの既定値で動かす。
// 不透明度だけはコメントと画像を別々に設定画面から調整できる。
export const DEFAULT_COMMENT_OVERLAY_SETTINGS: Readonly<CommentOverlaySettings> = {
  durationSeconds: 6,
  commentOpacity: 0.95,
  imageOpacity: 0.95,
  maxQueueSize: 64,
  fetchAllCandidateThreads: false,
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
    commentOpacity: clampFinite(
      input?.commentOpacity,
      MIN_COMMENT_OVERLAY_OPACITY,
      1,
      DEFAULT_COMMENT_OVERLAY_SETTINGS.commentOpacity,
    ),
    imageOpacity: clampFinite(
      input?.imageOpacity,
      MIN_COMMENT_OVERLAY_OPACITY,
      1,
      DEFAULT_COMMENT_OVERLAY_SETTINGS.imageOpacity,
    ),
    maxQueueSize: clampInteger(
      input?.maxQueueSize,
      0,
      3_000,
      DEFAULT_COMMENT_OVERLAY_SETTINGS.maxQueueSize,
    ),
    fetchAllCandidateThreads: input?.fetchAllCandidateThreads === true,
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
