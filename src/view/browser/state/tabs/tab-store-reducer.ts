import {
  setAutoRefreshEnabled,
  setAutoRefreshStoppedPageKey,
  startNextThreadWait,
} from "src/view/browser/state/tabs/tab-store-reducer-auto-refresh";
import {
  closeAllTabs,
  closeOtherTabs,
  closeRightTabs,
  closeTab,
  reopenClosedTab,
} from "src/view/browser/state/tabs/tab-store-reducer-close";
import {
  followNextThread,
  goBack,
  goForward,
  goToHistoryIndex,
  navigate,
  navigateTab,
  reload,
  updateTabViewState,
  updateTitle,
  updateTitleForTab,
} from "src/view/browser/state/tabs/tab-store-reducer-navigation";
import {
  addTab,
  openInNewTab,
  openInNewTabForce,
} from "src/view/browser/state/tabs/tab-store-reducer-open";
import {
  closePane,
  openInRightPane,
  setActivePane,
  splitPane,
  swapPaneTabs,
} from "src/view/browser/state/tabs/tab-store-reducer-panes";
import {
  closeWorkspaceWindow,
  collapseWorkspaceWindow,
  setWorkspaceWindowBounds,
} from "src/view/browser/state/tabs/tab-store-reducer-windows";
import { getWindowPanes } from "src/view/browser/state/tabs/tab-store-selectors";
import { sanitizeTabStoreState } from "src/view/browser/state/tabs/tab-store-session";
import {
  getPane,
  resolvePaneId,
  updatePane,
} from "src/view/browser/state/tabs/tab-store-state-helpers";
import { transferTab } from "src/view/browser/state/tabs/tab-store-transfer";
import {
  type ScopedTabAction,
  TAB_ACTION_TYPES,
  type TabStoreState,
} from "src/view/browser/state/tabs/tab-store-types";

// タブストア全体の reducer。
export function tabReducer(state: TabStoreState, action: ScopedTabAction): TabStoreState {
  const next = reduceTabState(state, action);
  if (next === state) return next;
  // 全体のフォーカスが変わる操作を一か所で反映し、各窓の選択を保持する。
  const windows = next.windows.map((window) => {
    const panes = getWindowPanes(next, window.id);
    const focused = panes.find((pane) => pane.id === next.activePaneId);
    const activePaneId =
      focused?.id ??
      (panes.some((pane) => pane.id === window.activePaneId)
        ? window.activePaneId
        : (panes[0]?.id ?? window.activePaneId));
    return activePaneId === window.activePaneId ? window : { ...window, activePaneId };
  });
  return windows.every((window, index) => window === next.windows[index])
    ? next
    : { ...next, windows };
}

function reduceTabState(state: TabStoreState, action: ScopedTabAction): TabStoreState {
  switch (action.type) {
    // パネルとタブを同じ保存経路に載せ、互いの更新による上書きを防ぐ。
    case TAB_ACTION_TYPES.UPDATE_BOTTOM_PANEL:
      if (!state.panes.some((pane) => pane.id === action.targetPaneId)) return state;
      return {
        ...state,
        bottomPanels: {
          ...state.bottomPanels,
          [action.targetPaneId]: { ...state.bottomPanels?.[action.targetPaneId], ...action.patch },
        },
      };

    case TAB_ACTION_TYPES.UPDATE_SIDE_PANEL:
      return { ...state, sidePanel: action.sidePanel };

    case TAB_ACTION_TYPES.ADD_TAB:
      return addTab(state, action);

    case TAB_ACTION_TYPES.OPEN_IN_NEW_TAB:
      return openInNewTab(state, action);

    case TAB_ACTION_TYPES.OPEN_IN_NEW_TAB_FORCE:
      return openInNewTabForce(state, action);

    case TAB_ACTION_TYPES.CLOSE_TAB:
      return closeTab(state, action);

    case TAB_ACTION_TYPES.CLOSE_OTHER_TABS:
      return closeOtherTabs(state, action);

    case TAB_ACTION_TYPES.CLOSE_RIGHT_TABS:
      return closeRightTabs(state, action);

    case TAB_ACTION_TYPES.CLOSE_ALL_TABS:
      return closeAllTabs(state, action);

    case TAB_ACTION_TYPES.REOPEN_CLOSED_TAB:
      return reopenClosedTab(state, action);

    case TAB_ACTION_TYPES.TOGGLE_PIN: {
      const paneId = resolvePaneId(state, action.paneId);
      return updatePane(state, paneId, (p) => {
        const tabs = p.tabs.map((t) => (t.id === action.tabId ? { ...t, pinned: !t.pinned } : t));
        // ホームも通常タブとして、利用者が固定したタブだけを先頭に並べる。
        tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned));
        return { ...p, tabs };
      });
    }

    case TAB_ACTION_TYPES.MOVE_TAB: {
      const paneId = resolvePaneId(state, action.paneId);
      const pane = getPane(state, paneId);
      const dragTab = pane.tabs.find((t) => t.id === action.dragTabId);
      // ホームも通常タブと同じ移動・ピン留め規則で扱う。
      if (!dragTab) {
        return state;
      }
      // 変更理由: 固定タブは並べ替えない。
      if (dragTab.pinned) {
        return state;
      }

      // 変更理由: @dnd-kit の OptimisticSortingPlugin はドラッグ中に DOM を物理的に
      // 並べ替え、最終位置を source.sortable.index（グループ内インデックス）として確定する。
      // ドロップ先タブIDから移動先を逆算すると、その投影インデックスとズレてホイール順序が
      // 表示順と食い違うため、グループ内インデックスを直接の真実として並べ替える。
      const group = pane.tabs.filter((t) => t.pinned === dragTab.pinned);
      const others = pane.tabs.filter((t) => t.pinned !== dragTab.pinned);
      const fromIndex = group.findIndex((t) => t.id === action.dragTabId);
      const toIndex = Math.max(0, Math.min(action.toIndex, group.length - 1));
      if (fromIndex === -1 || fromIndex === toIndex) {
        return state;
      }

      const reorderedGroup = [...group];
      reorderedGroup.splice(toIndex, 0, reorderedGroup.splice(fromIndex, 1)[0]);
      // ピン留めタブを先頭グループとして再結合する。
      return updatePane(state, paneId, (p) => ({
        ...p,
        tabs: dragTab.pinned ? [...reorderedGroup, ...others] : [...others, ...reorderedGroup],
      }));
    }

    case TAB_ACTION_TYPES.SELECT_TAB: {
      const paneId = resolvePaneId(state, action.paneId);
      return {
        ...updatePane(state, paneId, (p) => ({
          ...p,
          activeTabId: action.tabId,
        })),
        // 別窓化で同じペインの表示対象だけを差し替える時は、本窓のフォーカスを
        // 動かさない。通常のタブ選択では従来どおり対象ペインへフォーカスを移す。
        activePaneId: action.preserveActivePane ? state.activePaneId : paneId,
      };
    }

    case TAB_ACTION_TYPES.NAVIGATE:
      return navigate(state, action);

    case TAB_ACTION_TYPES.NAVIGATE_TAB:
      return navigateTab(state, action);

    case TAB_ACTION_TYPES.GO_BACK:
      return goBack(state, action);

    case TAB_ACTION_TYPES.GO_FORWARD:
      return goForward(state, action);

    case TAB_ACTION_TYPES.GO_TO_HISTORY_INDEX:
      return goToHistoryIndex(state, action);

    case TAB_ACTION_TYPES.UPDATE_TAB_VIEW_STATE:
      return updateTabViewState(state, action);

    case TAB_ACTION_TYPES.UPDATE_TITLE:
      return updateTitle(state, action);

    case TAB_ACTION_TYPES.UPDATE_TITLE_FOR_TAB:
      return updateTitleForTab(state, action);

    case TAB_ACTION_TYPES.RELOAD:
      return reload(state, action);

    case TAB_ACTION_TYPES.FOLLOW_NEXT_THREAD:
      return followNextThread(state, action);

    case TAB_ACTION_TYPES.SET_AUTO_REFRESH_ENABLED:
      return setAutoRefreshEnabled(state, action);

    case TAB_ACTION_TYPES.SET_AUTO_REFRESH_STOPPED_PAGE_KEY:
      return setAutoRefreshStoppedPageKey(state, action);

    case TAB_ACTION_TYPES.START_NEXT_THREAD_WAIT:
      return startNextThreadWait(state, action);

    // --- ペイン操作 ---

    case TAB_ACTION_TYPES.TRANSFER_TAB:
      return transferTab(state, action);

    case TAB_ACTION_TYPES.CLOSE_WORKSPACE_WINDOW:
      return closeWorkspaceWindow(state, action);

    case TAB_ACTION_TYPES.COLLAPSE_WORKSPACE_WINDOW:
      return collapseWorkspaceWindow(state, action);

    case TAB_ACTION_TYPES.SET_WORKSPACE_WINDOW_BOUNDS:
      return setWorkspaceWindowBounds(state, action);

    case TAB_ACTION_TYPES.SPLIT_PANE:
      return splitPane(state, action);

    case TAB_ACTION_TYPES.CLOSE_PANE:
      return closePane(state, action);

    case TAB_ACTION_TYPES.SWAP_PANE_TABS:
      return swapPaneTabs(state, action);

    case TAB_ACTION_TYPES.SET_ACTIVE_PANE:
      return setActivePane(state, action);

    case TAB_ACTION_TYPES.OPEN_IN_RIGHT_PANE:
      return openInRightPane(state, action);

    case TAB_ACTION_TYPES.RESTORE:
      return sanitizeTabStoreState(action.state);

    default:
      return state;
  }
}
