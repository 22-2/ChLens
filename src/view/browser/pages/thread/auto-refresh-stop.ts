export function shouldDeferExpiredAutoRefreshStop({
  shouldDeferNextThreadStop,
  expired,
  hasReachedThreadLimit,
  isActive,
  isDraining,
}: {
  shouldDeferNextThreadStop: boolean;
  expired: boolean;
  hasReachedThreadLimit: boolean;
  isActive: boolean;
  isDraining: boolean;
}): boolean {
  // dat落ちは非表示中に溜まった新着の再生待ちで停止を遅らせない。
  // 表示完了を待つのは通常の1000レス到達時だけとし、期限付きの次スレ探索は維持する。
  return shouldDeferNextThreadStop || (!expired && hasReachedThreadLimit && isActive && isDraining);
}
