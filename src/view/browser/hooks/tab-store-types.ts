import type { Dispatch, RefObject } from "react";
import type { Page, Pane, Tab, TabViewState } from "src/view/browser/types";

export interface TabStoreState {
  // 横並びのペイン群。配列順がそのまま画面上の左→右の並び。
  panes: Pane[];
  // フォーカス中のペイン。タブ追加/キーボード操作などの暗黙の対象になる。
  activePaneId: string;
  // 閉じたタブの undo は全ペイン共有。
  closedTabs: Tab[];
}

export type TabAction =
  | { type: "ADD_TAB" }
  | { type: "OPEN_IN_NEW_TAB"; page: Page; background?: boolean }
  | { type: "OPEN_IN_NEW_TAB_FORCE"; page: Page }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "CLOSE_OTHER_TABS"; tabId: string }
  | { type: "CLOSE_RIGHT_TABS"; tabId: string }
  | { type: "CLOSE_ALL_TABS" }
  | { type: "REOPEN_CLOSED_TAB" }
  | { type: "TOGGLE_PIN"; tabId: string }
  | { type: "MOVE_TAB"; dragTabId: string; toIndex: number }
  | { type: "SELECT_TAB"; tabId: string }
  | { type: "NAVIGATE"; page: Page }
  | { type: "NAVIGATE_TAB"; tabId: string; page: Page }
  | { type: "GO_BACK" }
  | { type: "GO_FORWARD" }
  | { type: "GO_TO_HISTORY_INDEX"; index: number }
  | {
      type: "UPDATE_TAB_VIEW_STATE";
      tabId: string;
      pageKey: string;
      patch: Partial<TabViewState>;
    }
  | { type: "UPDATE_TITLE"; title: string }
  | { type: "UPDATE_TITLE_FOR_TAB"; tabId: string; title: string; boardUrl?: string }
  | { type: "RELOAD" }
  | {
      type: "FOLLOW_NEXT_THREAD";
      page: Extract<Page, { type: "thread" }>;
      keepAutoRefresh?: boolean;
    }
  | {
      type: "SET_AUTO_REFRESH_ENABLED";
      enabled: boolean;
      pageKey?: string;
    }
  // --- ペイン操作（横分割） ---
  // いずれも対象ペインは注入された paneId（操作元ペイン）を基準にする。
  | { type: "SPLIT_PANE" }
  | { type: "OPEN_IN_RIGHT_PANE"; tabId: string }
  | { type: "CLOSE_PANE" }
  | { type: "SET_ACTIVE_PANE" }
  | {
      type: "MOVE_TAB_TO_PANE";
      tabId: string;
      fromPaneId: string;
      toPaneId: string;
      toIndex: number;
    }
  | { type: "RESTORE"; state: TabStoreState };

// ペインスコープ: 全アクションに「対象ペイン」を付与できる。
// 省略時はアクティブペインに作用する（グローバルハンドラ用）。
export type ScopedTabAction = TabAction & { paneId?: string };

export interface PaneScopedState {
  tabs: Tab[];
  activeTabId: string;
  closedTabs: Tab[];
}

export interface PaneScopedTabStore {
  state: PaneScopedState;
  // stateRef はグローバル状態を指す。ペイン解決には paneId を併用する。
  stateRef: RefObject<TabStoreState>;
  dispatch: Dispatch<ScopedTabAction>;
  activeTab: Tab;
  currentPage: Page;
  paneId: string;
}
