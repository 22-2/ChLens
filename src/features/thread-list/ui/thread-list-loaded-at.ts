import { useSyncExternalStore } from "react";

// 変更理由: 取得完了時刻はスレ一覧ページが持ち、表示はステータスバーの別コンポーネントが行うため、
// 選択中の履歴と同じく表示中のタブごとに共有する。
const loadedAtByTab = new Map<string, number>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** タブのスレ一覧の最終読み込み時刻を設定する。nullなら未読み込みとして消す。 */
export function setThreadListLoadedAt(tabId: string, loadedAt: number | null): void {
  if (loadedAt == null) loadedAtByTab.delete(tabId);
  else loadedAtByTab.set(tabId, loadedAt);
  for (const listener of listeners) listener();
}

export function useThreadListLoadedAt(tabId: string): number | null {
  return useSyncExternalStore(
    subscribe,
    () => loadedAtByTab.get(tabId) ?? null,
    () => null,
  );
}
