import { createPane, createTab } from "src/view/browser/state/tabs/tab-store-new-tab";
import {
  canOpenInRightPane,
  getPaneWindowId,
  getWindowPanes,
  MAX_PANES,
} from "src/view/browser/state/tabs/tab-store-selectors";
import {
  getPaneActiveTab,
  resolvePaneId,
} from "src/view/browser/state/tabs/tab-store-state-helpers";
import type { ScopedTabActionOf } from "src/view/browser/state/tabs/tab-store-types";
import { type TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { getCurrentPage, type Pane, type Tab } from "src/view/browser/types";

/** ペインの分割・統合・入れ替え・右ペインへの移動の reducer。 */

export function splitPane(
  state: TabStoreState,
  action: ScopedTabActionOf<"SPLIT_PANE">,
): TabStoreState {
  // 最大ペイン数に達していれば分割しない（2ペイン固定運用）。
  // 操作元ペインの右隣に、新規タブの設定（new_tab_page_mode）に従ったページのペインを作成してフォーカスする。
  const sourcePaneId = resolvePaneId(state, action.paneId);
  const sourceIndex = state.panes.findIndex((p) => p.id === sourcePaneId);
  const sourcePane = state.panes[sourceIndex];
  if (!sourcePane || getWindowPanes(state, getPaneWindowId(sourcePane)).length >= MAX_PANES)
    return state;
  const sourceActiveTab = sourcePane ? getPaneActiveTab(sourcePane) : null;
  const sourcePage = sourceActiveTab ? getCurrentPage(sourceActiveTab) : null;
  const newPane = {
    ...createPane(createTab(sourcePage, sourceActiveTab)),
    windowId: getPaneWindowId(sourcePane),
  };
  const panes = [...state.panes];
  panes.splice(sourceIndex + 1, 0, newPane);
  return { ...state, panes, activePaneId: newPane.id };
}

export function closePane(
  state: TabStoreState,
  action: ScopedTabActionOf<"CLOSE_PANE">,
): TabStoreState {
  // 最低1ペインは維持する。
  const paneId = resolvePaneId(state, action.paneId);
  const index = state.panes.findIndex((p) => p.id === paneId);
  if (index === -1) return state;
  const windowPanes = getWindowPanes(state, getPaneWindowId(state.panes[index]));
  if (windowPanes.length <= 1) return state;
  // 変更理由: ペイン解除は表示レイアウトの変更なのでタブを閉じず、左ペインを
  // 統合先にして左から右の順で並べる。選択中タブも維持して画面内容を失わない。
  const leftPane = windowPanes[0];
  const rightPane = windowPanes[1];
  const selectedTabId =
    windowPanes.find((candidate) => candidate.id === state.activePaneId)?.activeTabId ??
    leftPane.activeTabId;
  // 常設ホームの重複除去を行わず、両ペインの通常タブと選択をそのまま引き継ぐ。
  const mergedPane: Pane = {
    ...leftPane,
    // 統合後も固定タブのグループを先頭に保ち、並べ替えと表示順を一致させる。
    tabs: [...leftPane.tabs, ...rightPane.tabs].sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    activeTabId: selectedTabId,
  };
  return {
    ...state,
    panes: state.panes
      .filter((pane) => pane.id !== rightPane.id)
      .map((pane) => (pane.id === leftPane.id ? mergedPane : pane)),
    activePaneId: leftPane.id,
  };
}

export function swapPaneTabs(
  state: TabStoreState,
  action: ScopedTabActionOf<"SWAP_PANE_TABS">,
): TabStoreState {
  // 変更理由: 2ペインの表示内容だけを交換し、各ペインが保持している
  // 非選択タブの並びとペイン自体のフォーカスは維持する。
  const sourcePaneId = resolvePaneId(state, action.paneId);
  const sourceIndex = state.panes.findIndex((pane) => pane.id === sourcePaneId);
  const sourcePane = state.panes[sourceIndex];
  const targetPane =
    sourcePane &&
    getWindowPanes(state, getPaneWindowId(sourcePane)).find((pane) => pane.id !== sourcePaneId);
  if (!sourcePane || !targetPane) return state;

  const sourceTab = sourcePane.tabs.find((tab) => tab.id === sourcePane.activeTabId);
  const targetTab = targetPane.tabs.find((tab) => tab.id === targetPane.activeTabId);
  // ホームも他のページと同様にペイン間で交換する。
  if (!sourceTab || !targetTab) return state;
  // 変更理由: 固定タブは位置を動かさない。どちらかが固定なら入れ替えない。
  if (sourceTab.pinned || targetTab.pinned) return state;

  const replaceActiveTab = (pane: Pane, currentTabId: string, replacement: Tab): Pane => ({
    ...pane,
    tabs: pane.tabs.map((tab) => (tab.id === currentTabId ? replacement : tab)),
    activeTabId: replacement.id,
  });
  const updatedSourcePane = replaceActiveTab(sourcePane, sourceTab.id, targetTab);
  const updatedTargetPane = replaceActiveTab(targetPane, targetTab.id, sourceTab);

  return {
    ...state,
    panes: state.panes.map((pane) =>
      pane.id === sourcePane.id
        ? updatedSourcePane
        : pane.id === targetPane.id
          ? updatedTargetPane
          : pane,
    ),
  };
}

export function setActivePane(
  state: TabStoreState,
  action: ScopedTabActionOf<"SET_ACTIVE_PANE">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  if (paneId === state.activePaneId) return state;
  return { ...state, activePaneId: paneId };
}

export function openInRightPane(
  state: TabStoreState,
  action: ScopedTabActionOf<"OPEN_IN_RIGHT_PANE">,
): TabStoreState {
  // 操作元ペインのタブを右隣ペインへ移動する。右隣が無ければ新規作成する。
  const sourcePaneId = resolvePaneId(state, action.paneId);
  const sourceIndex = state.panes.findIndex((p) => p.id === sourcePaneId);
  if (sourceIndex === -1) return state;
  const sourcePane = state.panes[sourceIndex];
  const movingTab = sourcePane.tabs.find((t) => t.id === action.tabId);
  // ホームも通常タブとして移動し、空になったペインは更新時に補う。
  if (!movingTab) return state;
  // 変更理由: 固定タブは別ペインへ移さず、元の位置に留める。
  if (movingTab.pinned) return state;
  const windowPanes = getWindowPanes(state, getPaneWindowId(sourcePane));
  const rightPane = windowPanes[windowPanes.findIndex((pane) => pane.id === sourcePaneId) + 1];
  if (!rightPane && !canOpenInRightPane(state, sourcePaneId)) return state;

  // 元ペインから対象タブを除く。空になるなら既定タブを補充してペインを維持する。
  let remainingSourceTabs = sourcePane.tabs.filter((t) => t.id !== action.tabId);
  if (remainingSourceTabs.length === 0) {
    remainingSourceTabs = [createTab()];
  }
  const newSourceActiveId =
    sourcePane.activeTabId === action.tabId
      ? remainingSourceTabs[remainingSourceTabs.length - 1].id
      : sourcePane.activeTabId;
  const updatedSourcePane: Pane = {
    ...sourcePane,
    tabs: remainingSourceTabs,
    activeTabId: newSourceActiveId,
  };

  if (rightPane) {
    const updatedRightPane: Pane = {
      ...rightPane,
      tabs: [...rightPane.tabs, movingTab],
      activeTabId: movingTab.id,
    };
    const panes = state.panes.map((p) =>
      p.id === sourcePaneId ? updatedSourcePane : p.id === rightPane.id ? updatedRightPane : p,
    );
    return { ...state, panes, activePaneId: rightPane.id };
  }

  const newPane = { ...createPane(movingTab), windowId: getPaneWindowId(sourcePane) };
  const panes = state.panes.map((p) => (p.id === sourcePaneId ? updatedSourcePane : p));
  panes.splice(sourceIndex + 1, 0, newPane);
  return { ...state, panes, activePaneId: newPane.id };
}
