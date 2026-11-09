import { getPageIdentity } from "src/view/browser/page-type-definitions";
import {
  getAutoRefreshPageKey,
  resetAutoRefreshState,
} from "src/view/browser/state/tabs/auto-refresh-pages";
import { openInNewTabForce } from "src/view/browser/state/tabs/tab-store-reducer-open";
import { findTabAcrossPanes } from "src/view/browser/state/tabs/tab-store-selectors";
import {
  getPane,
  getPaneActiveTab,
  pushPageToTabHistory,
  resolvePaneId,
  updatePane,
  updateTargetTab,
} from "src/view/browser/state/tabs/tab-store-state-helpers";
import type { ScopedTabActionOf } from "src/view/browser/state/tabs/tab-store-types";
import { TAB_ACTION_TYPES, type TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { getCurrentPage } from "src/view/browser/types";
import { normalizePageLocation } from "src/view/browser/utils/page-location";

/** タブ内の遷移（履歴の移動、タイトル更新、再読み込み、次スレ追従）の reducer。 */

export function navigate(
  state: TabStoreState,
  action: ScopedTabActionOf<"NAVIGATE">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const targetTab = action.tabId
    ? findTabAcrossPanes(state, action.tabId)
    : getPaneActiveTab(getPane(state, paneId));
  // ホームからの選択も現在タブの履歴に積み、同じタブへ戻れるようにする。
  if (!targetTab) {
    return state;
  }
  const currentPage = getCurrentPage(targetTab);
  if (getPageIdentity(currentPage) === getPageIdentity(action.page)) {
    return state;
  }

  // 固定したページを残し、遷移先は同じペインの別タブで表示する。
  if (targetTab.pinned) {
    const owner = state.panes.find((pane) => pane.tabs.some((tab) => tab.id === targetTab.id));
    return openInNewTabForce(state, {
      type: TAB_ACTION_TYPES.OPEN_IN_NEW_TAB_FORCE,
      page: action.page,
      paneId: owner?.id ?? paneId,
      focus: true,
    });
  }

  const nextState = updateTargetTab(state, paneId, action.tabId, (tab) =>
    resetAutoRefreshState(pushPageToTabHistory(tab, action.page)),
  );
  // 明示的なタブ指定でも、元画面の選択タブからの遷移は従来どおりペインをアクティブにする。
  return action.tabId && !action.activatePane ? nextState : { ...nextState, activePaneId: paneId };
}

export function navigateTab(
  state: TabStoreState,
  action: ScopedTabActionOf<"NAVIGATE_TAB">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const pane = getPane(state, paneId);
  const targetTab = pane.tabs.find((tab) => tab.id === action.tabId);
  // 指定したタブ内で遷移し、他のホームへ操作を転送しない。
  if (!targetTab) {
    return state;
  }

  if (getPageIdentity(getCurrentPage(targetTab)) === getPageIdentity(action.page)) {
    return {
      ...updatePane(state, paneId, (p) => ({
        ...p,
        activeTabId: action.tabId,
      })),
      activePaneId: paneId,
    };
  }

  if (targetTab.pinned) {
    return openInNewTabForce(state, {
      type: TAB_ACTION_TYPES.OPEN_IN_NEW_TAB_FORCE,
      page: action.page,
      paneId,
      focus: true,
    });
  }

  // 指定タブの実履歴を保ったままページを追加する。
  return {
    ...updatePane(state, paneId, (p) => ({
      ...p,
      activeTabId: action.tabId,
      tabs: p.tabs.map((t) =>
        t.id === action.tabId ? resetAutoRefreshState(pushPageToTabHistory(t, action.page)) : t,
      ),
    })),
    activePaneId: paneId,
  };
}

export function goBack(state: TabStoreState, action: ScopedTabActionOf<"GO_BACK">): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const tab = action.tabId
    ? findTabAcrossPanes(state, action.tabId)
    : getPaneActiveTab(getPane(state, paneId));
  if (!tab) return state;
  // 戻るはタブ内の履歴を一つ戻すだけにし、別のホームタブへ転送しない。
  if (tab.currentIndex <= 0) return state;
  if (tab.pinned) return state;
  return updateTargetTab(state, paneId, action.tabId, (t) =>
    resetAutoRefreshState({
      ...t,
      currentIndex: t.currentIndex - 1,
    }),
  );
}

export function goForward(
  state: TabStoreState,
  action: ScopedTabActionOf<"GO_FORWARD">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const tab = action.tabId
    ? findTabAcrossPanes(state, action.tabId)
    : getPaneActiveTab(getPane(state, paneId));
  if (!tab) return state;
  if (tab.currentIndex >= tab.history.length - 1) return state;
  if (tab.pinned) return state;
  return updateTargetTab(state, paneId, action.tabId, (t) =>
    resetAutoRefreshState({
      ...t,
      currentIndex: t.currentIndex + 1,
    }),
  );
}

export function goToHistoryIndex(
  state: TabStoreState,
  action: ScopedTabActionOf<"GO_TO_HISTORY_INDEX">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const tab = action.tabId
    ? findTabAcrossPanes(state, action.tabId)
    : getPaneActiveTab(getPane(state, paneId));
  if (!tab) return state;
  if (action.index < 0 || action.index >= tab.history.length) return state;
  if (action.index === tab.currentIndex) return state;
  if (tab.pinned) return state;
  return updateTargetTab(state, paneId, action.tabId, (t) =>
    resetAutoRefreshState({
      ...t,
      currentIndex: action.index,
    }),
  );
}

export function updateTabViewState(
  state: TabStoreState,
  action: ScopedTabActionOf<"UPDATE_TAB_VIEW_STATE">,
): TabStoreState {
  // view state はタブIDで一意に特定できるため、ペインを跨いだ更新にも耐える。
  return {
    ...state,
    panes: state.panes.map((pane) => ({
      ...pane,
      tabs: pane.tabs.map((tab) => {
        if (tab.id !== action.tabId) {
          return tab;
        }

        return {
          ...tab,
          viewStates: {
            ...tab.viewStates,
            [action.pageKey]: {
              ...tab.viewStates?.[action.pageKey],
              ...action.patch,
            },
          },
        };
      }),
    })),
  };
}

export function updateTitle(
  state: TabStoreState,
  action: ScopedTabActionOf<"UPDATE_TITLE">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const tab = action.tabId
    ? findTabAcrossPanes(state, action.tabId)
    : getPaneActiveTab(getPane(state, paneId));
  if (!tab) {
    return state;
  }

  return updateTargetTab(state, paneId, action.tabId, (t) => {
    const currentPage = { ...t.history[t.currentIndex] };
    currentPage.title = action.title;
    const newHistory = [...t.history];
    newHistory[t.currentIndex] = currentPage;
    return {
      ...t,
      history: newHistory,
    };
  });
}

export function updateTitleForTab(
  state: TabStoreState,
  action: ScopedTabActionOf<"UPDATE_TITLE_FOR_TAB">,
): TabStoreState {
  // 背景ペイン/タブの非同期タイトル解決でも動くよう、全ペインを横断して該当タブを更新する。
  // boardUrl がある場合は、現在ページではなく対象板の履歴を更新する。
  // URL直開き後に板名解決が完了しても、履歴中の板一覧へ結果を残すため。
  return {
    ...state,
    panes: state.panes.map((pane) => {
      if (!pane.tabs.some((t) => t.id === action.tabId)) {
        return pane;
      }
      return {
        ...pane,
        tabs: pane.tabs.map((tab) => {
          if (tab.id !== action.tabId) {
            return tab;
          }

          const targetBoardUrl = action.boardUrl ? normalizePageLocation(action.boardUrl) : null;
          const updatedHistory = tab.history.map((page, index) => {
            const isTargetPage = targetBoardUrl
              ? page.type === "threadList" &&
                normalizePageLocation(page.boardUrl) === targetBoardUrl
              : index === tab.currentIndex;
            if (!isTargetPage || page.title === action.title) {
              return page;
            }

            if (page.type === "threadList") {
              return {
                ...page,
                // 変更理由: 板名解決がページ遷移後に完了しても、title と boardTitle を
                // 同時に更新して関連板導線と板名表示の不一致を防ぐ。
                title: action.title,
                boardTitle: action.title,
              };
            }

            return {
              ...page,
              title: action.title,
            };
          });

          if (updatedHistory.every((page, index) => page === tab.history[index])) {
            return tab;
          }

          return {
            ...tab,
            history: updatedHistory,
          };
        }),
      };
    }),
  };
}

export function reload(state: TabStoreState, action: ScopedTabActionOf<"RELOAD">): TabStoreState {
  // 履歴を変えずにreloadKeyをインクリメントする。
  // ContentAreaがこれをkeyに使うことでページコンポーネントが再マウントされ、データ再取得が走る。
  const paneId = resolvePaneId(state, action.paneId);
  return updateTargetTab(state, paneId, action.tabId, (tab) => ({
    ...tab,
    reloadKey: tab.reloadKey + 1,
  }));
}

export function followNextThread(
  state: TabStoreState,
  action: ScopedTabActionOf<"FOLLOW_NEXT_THREAD">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const targetTab = action.tabId
    ? findTabAcrossPanes(state, action.tabId)
    : getPaneActiveTab(getPane(state, paneId));
  if (targetTab?.pinned) {
    const owner = state.panes.find((pane) => pane.tabs.some((tab) => tab.id === targetTab.id));
    const destinationId = owner?.id ?? paneId;
    const opened = openInNewTabForce(state, {
      type: TAB_ACTION_TYPES.OPEN_IN_NEW_TAB_FORCE,
      page: action.page,
      paneId: destinationId,
      focus: true,
    });
    if (!action.keepAutoRefresh) return opened;
    // 次スレ待機の引き継ぎ先を新しいタブに束縛する。
    return updatePane(opened, destinationId, (pane) => ({
      ...pane,
      tabs: pane.tabs.map((tab) =>
        tab.id === pane.activeTabId
          ? {
              ...tab,
              autoRefreshEnabled: true,
              autoRefreshPageKey: getAutoRefreshPageKey(action.page),
            }
          : tab,
      ),
    }));
  }
  return updateTargetTab(state, paneId, action.tabId, (tab) => {
    const nextTab = pushPageToTabHistory(tab, action.page);
    // 自動次スレ移動は「このタブの流れ」を保つのが目的なので、
    // 既存タブ集約を経由せず現在タブの履歴と自動更新束縛を同時に更新する。
    return {
      ...nextTab,
      autoRefreshEnabled: action.keepAutoRefresh ? true : nextTab.autoRefreshEnabled,
      autoRefreshPageKey: action.keepAutoRefresh
        ? getAutoRefreshPageKey(action.page)
        : nextTab.autoRefreshPageKey,
      // 変更理由: dat落ち確認は旧スレ固有なので、次スレへ自動更新を引き継ぐ時は解除する。
      autoRefreshStoppedPageKey: null,
      nextThreadWaitPageKey: null,
    };
  });
}
