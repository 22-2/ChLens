export const DEFAULT_POPULAR_REPLY_THRESHOLD = 3;
export const MIN_POPULAR_REPLY_THRESHOLD = 1;
export const MAX_POPULAR_REPLY_THRESHOLD = 20;

/**
 * 保存済みセッションに古い値や不正な値が残っていても、人気フィルタの判定と
 * スライダー表示が同じ範囲に収まるように正規化する。
 */
export function normalizePopularReplyThreshold(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_POPULAR_REPLY_THRESHOLD;
  }

  return Math.min(
    MAX_POPULAR_REPLY_THRESHOLD,
    Math.max(MIN_POPULAR_REPLY_THRESHOLD, Math.round(numericValue)),
  );
}
