import { useSyncExternalStore } from "react";

// 変更理由: フィルタバーの開閉状態は各ページのフックが持つが、開閉ボタンはタイトルバー側の
// NavigationBar にあるため、ボタンの表示を切り替えられるよう開いているタブIDだけを共有する。
const openTabIds = new Set<string>();
// 変更理由: 常時表示のスレでは開閉ボタンを出さないため、常時表示中のタブIDも同じ仕組みで共有する。
const pinnedTabIds = new Set<string>();
const listeners = new Set<() => void>();

function updateTabIds(tabIds: Set<string>, tabId: string, enabled: boolean): void {
  if (tabIds.has(tabId) === enabled) {
    return;
  }
  if (enabled) {
    tabIds.add(tabId);
  } else {
    tabIds.delete(tabId);
  }
  for (const listener of listeners) {
    listener();
  }
}

export function setFilterToolbarOpen(tabId: string, open: boolean): void {
  updateTabIds(openTabIds, tabId, open);
}

export function setFilterToolbarPinned(tabId: string, pinned: boolean): void {
  updateTabIds(pinnedTabIds, tabId, pinned);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFilterToolbarOpen(tabId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openTabIds.has(tabId),
    () => false,
  );
}

// 変更理由: 通知は画面全体で1か所に出すため、どのタブでフィルタバーが開いていても上端の位置を変えられるよう、開いているタブが1つでもあるかを返す。
export function useAnyFilterToolbarOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openTabIds.size > 0,
    () => false,
  );
}

export function useFilterToolbarPinned(tabId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pinnedTabIds.has(tabId),
    () => false,
  );
}
