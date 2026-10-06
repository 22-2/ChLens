/** subject.txtの欠落は掲示板応答ではなく、アプリ側の更新状態として扱う。 */
export const isMissingFromSubject = (status?: string): boolean => status === "not_found";

/** 新着がない更新で subject.txt を強制取得する最短間隔 */
export const SUBJECT_FORCE_CHECK_INTERVAL_MS = 60 * 1000;

// 自動更新では Thread インスタンスが更新ごとに作り直されるため、
// 強制確認の時刻はスレURL単位でモジュールに保持する。
const lastForcedSubjectCheckAt = new Map<string, number>();

/**
 * 更新時に subject.txt を最新化してまでスレの存在を確認するかを決める。
 *
 * 変更理由: 自動更新は手動更新と同じ forceUpdate 経路を通るため、以前は更新のたびに
 * 板一覧全体を取得していた。新着レスを取得できたスレは生存が明らかなので確認せず、
 * 新着なし・本文取得失敗の回だけを dat 落ち候補として、一定間隔ごとに確認する。
 * dat 落ちしたスレには新着が来ないため、この絞り込みで検知漏れは起きない。
 */
export function shouldForceSubjectCheck({
  threadUrl,
  forceUpdate,
  hasNewResponses,
  now = Date.now(),
}: {
  threadUrl: string;
  forceUpdate: boolean;
  hasNewResponses: boolean;
  now?: number;
}): boolean {
  if (!forceUpdate || hasNewResponses) {
    return false;
  }
  const lastCheckedAt = lastForcedSubjectCheckAt.get(threadUrl);
  if (lastCheckedAt != null && now - lastCheckedAt < SUBJECT_FORCE_CHECK_INTERVAL_MS) {
    return false;
  }
  lastForcedSubjectCheckAt.set(threadUrl, now);
  return true;
}

/** テスト間で強制確認の履歴を持ち越さないための初期化 */
export function resetForcedSubjectCheckHistory(): void {
  lastForcedSubjectCheckAt.clear();
}
