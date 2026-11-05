import {
  getPaneWindowId,
  getWindowPanes,
  MAX_PANES,
} from "src/view/browser/state/tabs/tab-store-selectors";
import type { TabAction, TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { MAIN_WINDOW_ID } from "src/view/browser/state/tabs/window-model";
import { createHomeTab } from "src/view/browser/types";

/** タブをペイン・窓へ移し、必要なら新しいペインを同時に作る。 */
export function transferTab(
  state: TabStoreState,
  action: Extract<TabAction, { type: "TRANSFER_TAB" }>,
): TabStoreState {
  const to = action.to;
  const creating = "newWindowId" in to;
  const splitting = "splitPaneId" in to;
  if (
    creating &&
    (to.newWindowId === MAIN_WINDOW_ID ||
      state.windows.some((window) => window.id === to.newWindowId) ||
      state.panes.some((pane) => pane.id === to.newPaneId))
  )
    return state;
  const destination = creating
    ? null
    : state.panes.find(
        (pane) =>
          pane.id === (splitting ? to.splitPaneId : to.paneId) &&
          getPaneWindowId(pane) === to.windowId,
      );
  if (!creating && !destination) return state;
  if (
    splitting &&
    (state.panes.some((pane) => pane.id === to.newPaneId) ||
      getWindowPanes(state, to.windowId).length >= MAX_PANES)
  )
    return state;
  const source = state.panes.find((pane) => pane.tabs.some((tab) => tab.id === action.tabId));
  const tab = source?.tabs.find((candidate) => candidate.id === action.tabId);
  if (!source || !tab) return state;
  if (!splitting && destination?.id === source.id) return state;
  const sourceWindowId = getPaneWindowId(source);
  const remaining = source.tabs.filter((candidate) => candidate.id !== tab.id);
  const removeSourcePane =
    remaining.length === 0 &&
    (!splitting || source.id !== destination?.id) &&
    (sourceWindowId !== MAIN_WINDOW_ID || getWindowPanes(state, sourceWindowId).length > 1);
  const removeSourceWindow =
    removeSourcePane &&
    sourceWindowId !== MAIN_WINDOW_ID &&
    getWindowPanes(state, sourceWindowId).length === 1;
  const replacement = remaining.length || removeSourcePane ? remaining : [createHomeTab()];
  const panes = state.panes.flatMap((pane) => {
    if (pane.id !== source.id) return [pane];
    if (removeSourcePane) return [];
    return [
      {
        ...pane,
        tabs: replacement,
        activeTabId:
          pane.activeTabId === tab.id ? replacement[replacement.length - 1].id : pane.activeTabId,
      },
    ];
  });
  // タブそのものを移すため、履歴・スクロール位置や自動更新の状態を作り直さない。
  let targetPaneId: string;
  if (creating) {
    targetPaneId = to.newPaneId;
    panes.push({
      id: to.newPaneId,
      windowId: to.newWindowId,
      tabs: [tab],
      activeTabId: tab.id,
    });
  } else if (splitting) {
    targetPaneId = to.newPaneId;
    const index = panes.findIndex((pane) => pane.id === to.splitPaneId);
    // 元のペインと移動先を同時に更新し、途中の描画でタブを失わない。
    panes.splice(index + (to.side === "right" ? 1 : 0), 0, {
      id: to.newPaneId,
      windowId: to.windowId,
      tabs: [tab],
      activeTabId: tab.id,
    });
  } else {
    targetPaneId = to.paneId;
    const targetIndex = panes.findIndex((pane) => pane.id === to.paneId);
    const target = panes[targetIndex];
    const pinnedCount = target.tabs.filter((candidate) => candidate.pinned).length;
    const index = Math.max(0, Math.min(to.index, target.tabs.length));
    const insertAt = tab.pinned ? Math.min(index, pinnedCount) : Math.max(index, pinnedCount);
    const tabs = [...target.tabs];
    tabs.splice(insertAt, 0, tab);
    panes[targetIndex] = { ...target, tabs, activeTabId: tab.id };
  }
  const windows = state.windows.filter(
    (window) => !removeSourceWindow || window.id !== sourceWindowId,
  );
  if (creating) windows.push({ id: to.newWindowId, kind: "aux", activePaneId: to.newPaneId });
  const bottomPanels =
    state.bottomPanels && removeSourcePane
      ? Object.fromEntries(Object.entries(state.bottomPanels).filter(([id]) => id !== source.id))
      : state.bottomPanels;
  return {
    ...state,
    panes,
    windows,
    activePaneId: targetPaneId,
    ...(bottomPanels ? { bottomPanels } : {}),
  };
}
