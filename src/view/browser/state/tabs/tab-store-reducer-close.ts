import { resetAutoRefreshState } from "src/view/browser/state/tabs/auto-refresh-pages";
import { createTab } from "src/view/browser/state/tabs/tab-store-new-tab";
import { closePane } from "src/view/browser/state/tabs/tab-store-reducer-panes";
import { closeWorkspaceWindow } from "src/view/browser/state/tabs/tab-store-reducer-windows";
import {
  canCloseTab,
  canReopenClosedTab,
  getPaneWindowId,
  getWindowPanes,
  hasClosableOtherTabs,
  hasClosableRightTabs,
} from "src/view/browser/state/tabs/tab-store-selectors";
import {
  getPane,
  getPaneActiveTab,
  pushClosed,
  resolvePaneId,
  updatePane,
} from "src/view/browser/state/tabs/tab-store-state-helpers";
import type { ScopedTabActionOf } from "src/view/browser/state/tabs/tab-store-types";
import { TAB_ACTION_TYPES, type TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { MAIN_WINDOW_ID } from "src/view/browser/state/tabs/window-model";
import { createHomeTab, getCurrentPage, type Tab } from "src/view/browser/types";

/** タブを閉じる・閉じたタブを開き直す操作の reducer。 */

export function closeTab(
  state: TabStoreState,
  action: ScopedTabActionOf<"CLOSE_TAB">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const pane = getPane(state, paneId);
  const target = pane.tabs.find((t) => t.id === action.tabId);
  if (!target || !canCloseTab(target)) {
    return state;
  }
  // 2ペイン時は最後のタブを閉じる操作で空ペインを残さず、もう片方へ戻す。
  const windowPanes = getWindowPanes(state, getPaneWindowId(pane));
  if (
    pane.tabs.length === 1 &&
    windowPanes.length === 1 &&
    getPaneWindowId(pane) !== MAIN_WINDOW_ID &&
    !action.replaceLastTab
  ) {
    // 別窓の最後のタブを閉じたら窓ごと履歴に残して終了する。
    return closeWorkspaceWindow(state, {
      type: TAB_ACTION_TYPES.CLOSE_WORKSPACE_WINDOW,
      windowId: getPaneWindowId(pane),
    });
  }
  if (pane.tabs.length <= 1 && windowPanes.length > 1 && !action.replaceLastTab) {
    const panes = state.panes.filter((candidate) => candidate.id !== paneId);
    return {
      ...state,
      panes,
      activePaneId: panes.some((candidate) => candidate.id === state.activePaneId)
        ? state.activePaneId
        : windowPanes.find((candidate) => candidate.id !== paneId)!.id,
      closedTabs: pushClosed(state.closedTabs, target),
    };
  }
  // 単一ペインを空にせず、設定した新規タブページにも依存しないようホームを明示する。
  if (pane.tabs.length <= 1) {
    const replacement = createHomeTab();
    return {
      ...updatePane(state, paneId, (p) => ({
        ...p,
        tabs: [replacement],
        activeTabId: replacement.id,
      })),
      // 別窓の終了で最後のタブを置き換える場合も、本窓のフォーカスは奪わない。
      activePaneId: action.preserveActivePane ? state.activePaneId : paneId,
      closedTabs: pushClosed(state.closedTabs, target),
    };
  }
  const closingIndex = pane.tabs.indexOf(target);
  const remaining = pane.tabs.filter((t) => t.id !== action.tabId);
  // 変更理由: 2ペインで表示中のタブを閉じると、同じペインに別のタブが入れ替わって表示され続ける。
  // 分割は表示中のタブの組を見るための状態なので、片方を閉じたらペインを解除して、
  // もう片方のペインの表示中タブを残す。別窓の終了処理では元窓のレイアウトを変えない。
  if (
    windowPanes.length > 1 &&
    action.tabId === pane.activeTabId &&
    !action.preserveActivePane &&
    !action.replaceLastTab
  ) {
    const otherPane = windowPanes.find((candidate) => candidate.id !== paneId)!;
    const closedState = updatePane(state, paneId, (p) => ({
      ...p,
      tabs: remaining,
      activeTabId: remaining[Math.min(closingIndex, remaining.length - 1)].id,
    }));
    return closePane(
      {
        ...closedState,
        activePaneId: otherPane.id,
        closedTabs: pushClosed(state.closedTabs, target),
      },
      { type: TAB_ACTION_TYPES.CLOSE_PANE, paneId },
    );
  }
  let newActiveId = pane.activeTabId;
  if (action.tabId === pane.activeTabId) {
    const newIndex = Math.min(closingIndex, remaining.length - 1);
    newActiveId = remaining[newIndex].id;
  }
  return {
    ...updatePane(state, paneId, (p) => ({
      ...p,
      tabs: remaining,
      activeTabId: newActiveId,
    })),
    // 別窓終了時は元窓のフォーカスペインを奪わない。通常のタブ閉じる操作では
    // 従来どおり対象ペインへフォーカスを移すため、呼び出し側で明示的に指定する。
    activePaneId: action.preserveActivePane ? state.activePaneId : paneId,
    closedTabs: pushClosed(state.closedTabs, target),
  };
}

export function closeOtherTabs(
  state: TabStoreState,
  action: ScopedTabActionOf<"CLOSE_OTHER_TABS">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const pane = getPane(state, paneId);
  // 指定タブと固定タブ以外を閉じる
  if (!hasClosableOtherTabs(pane.tabs, action.tabId)) return state;
  const closed = pane.tabs.filter((t) => t.id !== action.tabId && !t.pinned);
  const remaining = pane.tabs.filter((t) => t.id === action.tabId || t.pinned);
  if (remaining.length === 0) return state;
  let newClosed = state.closedTabs;
  for (const t of closed) {
    newClosed = pushClosed(newClosed, t);
  }
  return {
    ...updatePane(state, paneId, (p) => ({
      ...p,
      tabs: remaining,
      activeTabId: action.tabId,
    })),
    activePaneId: paneId,
    closedTabs: newClosed,
  };
}

export function closeRightTabs(
  state: TabStoreState,
  action: ScopedTabActionOf<"CLOSE_RIGHT_TABS">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const pane = getPane(state, paneId);
  const idx = pane.tabs.findIndex((t) => t.id === action.tabId);
  if (idx === -1) return state;
  if (!hasClosableRightTabs(pane.tabs, action.tabId)) return state;
  const rightTabs = pane.tabs.slice(idx + 1).filter((t) => !t.pinned);
  const rightIds = new Set(rightTabs.map((t) => t.id));
  const remaining = pane.tabs.filter((t) => !rightIds.has(t.id));
  let newClosed = state.closedTabs;
  for (const t of rightTabs) {
    newClosed = pushClosed(newClosed, t);
  }
  let newActiveId = pane.activeTabId;
  if (rightIds.has(pane.activeTabId)) {
    newActiveId = action.tabId;
  }
  return {
    ...updatePane(state, paneId, (p) => ({
      ...p,
      tabs: remaining,
      activeTabId: newActiveId,
    })),
    activePaneId: paneId,
    closedTabs: newClosed,
  };
}

export function closeAllTabs(
  state: TabStoreState,
  action: ScopedTabActionOf<"CLOSE_ALL_TABS">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const pane = getPane(state, paneId);
  // 固定タブ以外をすべて閉じ、新しいタブを開く
  const pinned = pane.tabs.filter((t) => t.pinned);
  const closed = pane.tabs.filter((t) => !t.pinned);
  let newClosed = state.closedTabs;
  for (const t of closed) {
    newClosed = pushClosed(newClosed, t);
  }
  const activeTab = getPaneActiveTab(pane);
  const sourcePage = getCurrentPage(activeTab);
  const newTab = createTab(sourcePage, activeTab);
  return {
    ...updatePane(state, paneId, (p) => ({
      ...p,
      tabs: [...pinned, newTab],
      activeTabId: newTab.id,
    })),
    activePaneId: paneId,
    closedTabs: newClosed,
  };
}

export function reopenClosedTab(
  state: TabStoreState,
  action: ScopedTabActionOf<"REOPEN_CLOSED_TAB">,
): TabStoreState {
  if (!canReopenClosedTab(state)) return state;
  const paneId = resolvePaneId(state, action.paneId);
  // 履歴から選択した項目だけを取り除き、残りの順序を保つ。
  const index =
    action.tabId === undefined ? 0 : state.closedTabs.findIndex((tab) => tab.id === action.tabId);
  if (index < 0) return state;
  const reopened = state.closedTabs[index]!;
  const rest = state.closedTabs.filter((_, i) => i !== index);
  // 変更理由: 閉じたタブを新規タブとして開き直す時は、自動更新状態を引き継がない。
  const restored: Tab = {
    ...resetAutoRefreshState(reopened),
    id: crypto.randomUUID(),
  };
  return {
    ...updatePane(state, paneId, (p) => ({
      ...p,
      // 窓の終了では固定タブも履歴に入るため、復元時も固定領域の後ろへ戻す。
      tabs: restored.pinned
        ? [...p.tabs.filter((tab) => tab.pinned), restored, ...p.tabs.filter((tab) => !tab.pinned)]
        : [...p.tabs, restored],
      activeTabId: restored.id,
    })),
    activePaneId: paneId,
    closedTabs: rest,
  };
}
