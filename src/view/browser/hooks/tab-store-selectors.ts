import type { TabStoreState } from "src/view/browser/hooks/tab-store-types";
import type { Tab } from "src/view/browser/types";

/** 横分割を現状2ペイン固定で扱うための上限。 */
export const MAX_PANES = 2;

export interface TabLocation {
  readonly paneId: string;
  readonly tab: Tab;
  readonly tabs: readonly Tab[];
  readonly tabCount: number;
}

/**
 * タブIDから、タブ本体だけでなく所有ペインも解決する。
 *
 * 変更理由: 別窓からの操作ではactivePaneではなく対象タブの所有ペインを
 * 更新する必要があり、検索処理をコマンド側とreducer側で別実装にすると
 * 対象解決の条件がずれるため。
 */
export function findTabLocation(state: TabStoreState, tabId: string): TabLocation | null {
  for (const pane of state.panes) {
    const tab = pane.tabs.find((candidate) => candidate.id === tabId);
    if (tab) {
      return { paneId: pane.id, tab, tabs: pane.tabs, tabCount: pane.tabs.length };
    }
  }
  return null;
}

/** 全ペインを横断してタブを探す。 */
export function findTabAcrossPanes(state: TabStoreState, tabId: string): Tab | null {
  return findTabLocation(state, tabId)?.tab ?? null;
}

/**
 * 固定タブではなく、ペインに残す最後の1枚でもないかを判定する。
 *
 * 最後の1枚を別窓終了時の代替タブへ置き換える経路だけは許可できるため、
 * その例外を呼び出し側で個別実装せず、同じ判定関数で表現する。
 */
export function canCloseTab(tab: Tab, tabCount: number, replaceLastTab = false): boolean {
  return !tab.pinned && (tabCount > 1 || replaceLastTab);
}

/** 対象タブ以外に閉じられる通常タブがあるかを判定する。 */
export function hasClosableOtherTabs(tabs: readonly Tab[], targetTabId: string): boolean {
  return tabs.some((tab) => tab.id !== targetTabId && !tab.pinned);
}

/** 対象タブの右側に閉じられる通常タブがあるかを判定する。 */
export function hasClosableRightTabs(tabs: readonly Tab[], targetTabId: string): boolean {
  const targetIndex = tabs.findIndex((tab) => tab.id === targetTabId);
  return targetIndex !== -1 && tabs.slice(targetIndex + 1).some((tab) => !tab.pinned);
}

/** 閉じたタブを復元できる状態かを判定する。 */
export function canReopenClosedTab(state: TabStoreState): boolean {
  return state.closedTabs.length > 0;
}

/** 対象ペインから右ペインへタブを移動できるかを判定する。 */
export function canOpenInRightPane(state: TabStoreState, paneId: string): boolean {
  const paneIndex = state.panes.findIndex((pane) => pane.id === paneId);
  if (paneIndex === -1) {
    return false;
  }

  // 右隣が既にあればそこへ移動でき、なければペイン上限まで新設できる。
  return state.panes[paneIndex + 1] !== undefined || state.panes.length < MAX_PANES;
}
