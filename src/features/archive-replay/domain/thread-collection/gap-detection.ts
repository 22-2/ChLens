export interface ThreadTimeRange {
  startSeconds: number;
  endSeconds: number;
}

/** スレ間の未カバー区間を探す。レスが少ない時間帯との区別は利用者に委ねる。 */
export function detectThreadGaps(
  ranges: readonly ThreadTimeRange[],
  minimumGapSeconds: number,
): ThreadTimeRange[] {
  if (!Number.isFinite(minimumGapSeconds) || minimumGapSeconds < 0) {
    throw new RangeError("空白のしきい値が不正です");
  }
  const sorted = [...ranges].sort((a, b) => a.startSeconds - b.startSeconds);
  const gaps: ThreadTimeRange[] = [];
  let coveredUntil: number | null = null;
  for (const range of sorted) {
    if (
      !Number.isFinite(range.startSeconds) ||
      !Number.isFinite(range.endSeconds) ||
      range.startSeconds > range.endSeconds
    ) {
      throw new RangeError("スレの投稿時刻の範囲が不正です");
    }
    if (coveredUntil !== null && range.startSeconds - coveredUntil > minimumGapSeconds) {
      gaps.push({ startSeconds: coveredUntil, endSeconds: range.startSeconds });
    }
    // 重なったスレのうち、最も遅い終了時刻までを覆われた区間とする。
    coveredUntil = Math.max(coveredUntil ?? range.endSeconds, range.endSeconds);
  }
  return gaps;
}
