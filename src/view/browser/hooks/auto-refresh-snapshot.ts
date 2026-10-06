/** 更新を始めた時点のレス件数と、その更新の扱い。完了時に比較して新着を判定する。 */
export interface PendingRefreshSnapshot {
  responseCount: number;
  lastResponseNum: number | null;
  // タイマー起点の更新だけ通知対象にし、初回取得や手動更新では通知しない。
  shouldNotify: boolean;
  // 自動停止のアイドル判定に数えてよい更新かどうか。
  // ON直後の初回更新は「新着ゼロ」でも放置とは見なさないので false にする。
  isIdleStopCandidate: boolean;
}

export interface ResponseSnapshot {
  responseCount: number;
  lastResponseNum: number | null;
}

export interface RefreshRequestKind {
  isIdleStopCandidate: boolean;
  shouldNotify: boolean;
}

/**
 * 更新開始を記録する。完了待ちの更新があれば、件数は最初の記録を保ったまま扱いだけを重ねる。
 *
 * 自動更新の完了前に手動更新や書き込み後の再取得が割り込んでも、通信完了は1回にまとまる。
 * 後から来た記録で件数を上書きすると、最初の更新で届いた新着を取りこぼすため件数は変えない。
 */
export function mergePendingRefresh(
  pending: PendingRefreshSnapshot | null,
  current: ResponseSnapshot,
  request: RefreshRequestKind,
): PendingRefreshSnapshot {
  if (pending == null) {
    return {
      responseCount: current.responseCount,
      lastResponseNum: current.lastResponseNum,
      shouldNotify: request.shouldNotify,
      isIdleStopCandidate: request.isIdleStopCandidate,
    };
  }

  return {
    ...pending,
    // 外部の手動更新が自動更新中に割り込んだ場合は、同じ通信完了を
    // アイドル停止の一回として数えない。
    isIdleStopCandidate: pending.isIdleStopCandidate && request.isIdleStopCandidate,
    // 自動更新中に手動更新が重なっても、最初のタイマー起点の通知意図は失わない。
    shouldNotify: pending.shouldNotify || request.shouldNotify,
  };
}

export interface RefreshCompletion {
  hasNewResponses: boolean;
  /** 通知に使う新着件数。件数が減った・同数でも末尾が変わった場合も 1 件として扱う。 */
  newResponseCount: number;
}

export function compareRefreshSnapshot(
  pending: ResponseSnapshot,
  current: ResponseSnapshot,
): RefreshCompletion {
  const hasNewResponses =
    pending.responseCount !== current.responseCount ||
    pending.lastResponseNum !== current.lastResponseNum;
  return {
    hasNewResponses,
    newResponseCount: hasNewResponses
      ? Math.max(1, current.responseCount - pending.responseCount)
      : 0,
  };
}
