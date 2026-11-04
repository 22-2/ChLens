import type { TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { MAIN_WINDOW_ID } from "src/view/browser/state/tabs/window-model";
import type { Pane, Tab } from "src/view/browser/types";

/** 横分割を現状2ペイン固定で扱うための上限。 */
export const MAX_PANES = 2;

export function getPaneWindowId(pane: Pane): string {
  return pane.windowId ?? MAIN_WINDOW_ID;
}

export function getWindowPanes(state: TabStoreState, windowId: string): Pane[] {
  return state.panes.filter((pane) => getPaneWindowId(pane) === windowId);
}

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

/** 固定タブ以外は最後の1枚も閉じられる。閉じた後のペイン処理はreducerが決める。 */
export function canCloseTab(tab: Tab): boolean {
  return !tab.pinned;
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
  const pane = state.panes.find((candidate) => candidate.id === paneId);
  if (!pane) return false;
  const panes = getWindowPanes(state, getPaneWindowId(pane));
  const paneIndex = panes.findIndex((candidate) => candidate.id === paneId);
  if (paneIndex === -1) {
    return false;
  }

  // 右隣が既にあればそこへ移動でき、なければペイン上限まで新設できる。
  return panes[paneIndex + 1] !== undefined || panes.length < MAX_PANES;
}

/** タブの移動先として選べるペイン。 */
export interface TabMoveDestination {
  readonly windowId: string;
  readonly paneId: string;
  /** メニューとコマンドで表示する名前。 */
  readonly label: string;
}

function listOrderedPanes(state: TabStoreState): Pane[] {
  const auxWindowIds = state.windows
    .filter((window) => window.kind === "aux")
    .map((window) => window.id);
  return [MAIN_WINDOW_ID, ...auxWindowIds].flatMap((windowId) => getWindowPanes(state, windowId));
}

/**
 * タブを移せるペインを、本窓→別窓、窓内は左→右の順に並べて返す。
 *
 * 変更理由: メニューとコマンドパレットで移動先の並びと名前がずれないよう、
 * 状態から一度だけ組み立てる。元のペイン自身は移動先に含めない。
 */
export function listTabMoveDestinations(state: TabStoreState, tabId: string): TabMoveDestination[] {
  const source = state.panes.find((pane) => pane.tabs.some((tab) => tab.id === tabId));
  if (!source) return [];
  const sourceWindowId = getPaneWindowId(source);
  const auxWindowIds = state.windows
    .filter((window) => window.kind === "aux")
    .map((window) => window.id);
  const destinations: TabMoveDestination[] = [];
  for (const windowId of [MAIN_WINDOW_ID, ...auxWindowIds]) {
    const panes = getWindowPanes(state, windowId);
    panes.forEach((pane, index) => {
      if (pane.id === source.id) return;
      let label: string;
      if (windowId === sourceWindowId) {
        // 同じ窓の2ペインは左右が自明なので、番号を付けずに反対側と呼ぶ。
        label = panes.length === 2 ? "反対側のペインへ移動" : `ペイン${index + 1}へ移動`;
      } else {
        const windowName =
          windowId === MAIN_WINDOW_ID ? "メイン画面" : `別窓${auxWindowIds.indexOf(windowId) + 1}`;
        label =
          panes.length === 1 ? `${windowName}へ移動` : `${windowName}のペイン${index + 1}へ移動`;
      }
      destinations.push({ windowId, paneId: pane.id, label });
    });
  }
  return destinations;
}

/** 元のペインの次にあたる移動先。末尾なら先頭へ戻る。 */
export function findNextTabMoveDestination(
  state: TabStoreState,
  tabId: string,
): TabMoveDestination | null {
  const destinations = listTabMoveDestinations(state, tabId);
  if (destinations.length === 0) return null;
  const order = listOrderedPanes(state).map((pane) => pane.id);
  const source = state.panes.find((pane) => pane.tabs.some((tab) => tab.id === tabId));
  const sourceIndex = source ? order.indexOf(source.id) : -1;
  return (
    destinations.find((destination) => order.indexOf(destination.paneId) > sourceIndex) ??
    destinations[0]
  );
}
