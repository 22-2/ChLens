import type { TabAction, TabStoreState } from "src/view/browser/hooks/tab-store-types";
import type { Page, TabViewState } from "src/view/browser/types";

type ActionOf<Type extends TabAction["type"]> = Extract<TabAction, { type: Type }>;
type PayloadOf<Type extends TabAction["type"]> = Omit<ActionOf<Type>, "type">;

export interface TabActionCreators {
  addTab(options?: PayloadOf<"ADD_TAB">): ActionOf<"ADD_TAB">;
  openInNewTab(
    page: Page,
    options?: Omit<PayloadOf<"OPEN_IN_NEW_TAB">, "page">,
  ): ActionOf<"OPEN_IN_NEW_TAB">;
  openInNewTabForce(
    page: Page,
    options?: Omit<PayloadOf<"OPEN_IN_NEW_TAB_FORCE">, "page">,
  ): ActionOf<"OPEN_IN_NEW_TAB_FORCE">;
  closeTab(tabId: string, options?: Omit<PayloadOf<"CLOSE_TAB">, "tabId">): ActionOf<"CLOSE_TAB">;
  closeOtherTabs(tabId: string): ActionOf<"CLOSE_OTHER_TABS">;
  closeRightTabs(tabId: string): ActionOf<"CLOSE_RIGHT_TABS">;
  closeAllTabs(): ActionOf<"CLOSE_ALL_TABS">;
  reopenClosedTab(): ActionOf<"REOPEN_CLOSED_TAB">;
  togglePin(tabId: string): ActionOf<"TOGGLE_PIN">;
  moveTab(dragTabId: string, toIndex: number): ActionOf<"MOVE_TAB">;
  selectTab(
    tabId: string,
    options?: Omit<PayloadOf<"SELECT_TAB">, "tabId">,
  ): ActionOf<"SELECT_TAB">;
  navigate(page: Page): ActionOf<"NAVIGATE">;
  navigateTab(tabId: string, page: Page): ActionOf<"NAVIGATE_TAB">;
  goBack(): ActionOf<"GO_BACK">;
  goForward(): ActionOf<"GO_FORWARD">;
  goToHistoryIndex(index: number): ActionOf<"GO_TO_HISTORY_INDEX">;
  updateTabViewState(
    tabId: string,
    pageKey: string,
    patch: Partial<TabViewState>,
  ): ActionOf<"UPDATE_TAB_VIEW_STATE">;
  updateTitle(title: string): ActionOf<"UPDATE_TITLE">;
  updateTitleForTab(
    tabId: string,
    title: string,
    boardUrl?: string,
  ): ActionOf<"UPDATE_TITLE_FOR_TAB">;
  reload(): ActionOf<"RELOAD">;
  followNextThread(
    page: Extract<Page, { type: "thread" }>,
    options?: Omit<PayloadOf<"FOLLOW_NEXT_THREAD">, "page">,
  ): ActionOf<"FOLLOW_NEXT_THREAD">;
  setAutoRefreshEnabled(enabled: boolean, pageKey?: string): ActionOf<"SET_AUTO_REFRESH_ENABLED">;
  splitPane(): ActionOf<"SPLIT_PANE">;
  openInRightPane(tabId: string): ActionOf<"OPEN_IN_RIGHT_PANE">;
  closePane(): ActionOf<"CLOSE_PANE">;
  setActivePane(): ActionOf<"SET_ACTIVE_PANE">;
  moveTabToPane(
    tabId: string,
    fromPaneId: string,
    toPaneId: string,
    toIndex: number,
  ): ActionOf<"MOVE_TAB_TO_PANE">;
  restore(state: TabStoreState): ActionOf<"RESTORE">;
}

/**
 * TabStoreへ渡すアクションを生成する。
 *
 * 変更理由: UIごとにアクションの文字列と引数を組み立てると、別窓向けの
 * dispatchへ移行する際に対象タブの指定を取り違えやすいため、生成責務を
 * 一つのAPIへ集約している。アクションオブジェクト自体は毎回新しく生成する。
 */
export const tabActions: TabActionCreators = {
  addTab: (options = {}) => ({ type: "ADD_TAB", ...options }),
  openInNewTab: (page, options = {}) => ({ type: "OPEN_IN_NEW_TAB", page, ...options }),
  openInNewTabForce: (page, options = {}) => ({ type: "OPEN_IN_NEW_TAB_FORCE", page, ...options }),
  closeTab: (tabId, options = {}) => ({ type: "CLOSE_TAB", tabId, ...options }),
  closeOtherTabs: (tabId) => ({ type: "CLOSE_OTHER_TABS", tabId }),
  closeRightTabs: (tabId) => ({ type: "CLOSE_RIGHT_TABS", tabId }),
  closeAllTabs: () => ({ type: "CLOSE_ALL_TABS" }),
  reopenClosedTab: () => ({ type: "REOPEN_CLOSED_TAB" }),
  togglePin: (tabId) => ({ type: "TOGGLE_PIN", tabId }),
  moveTab: (dragTabId, toIndex) => ({ type: "MOVE_TAB", dragTabId, toIndex }),
  selectTab: (tabId, options = {}) => ({ type: "SELECT_TAB", tabId, ...options }),
  navigate: (page) => ({ type: "NAVIGATE", page }),
  navigateTab: (tabId, page) => ({ type: "NAVIGATE_TAB", tabId, page }),
  goBack: () => ({ type: "GO_BACK" }),
  goForward: () => ({ type: "GO_FORWARD" }),
  goToHistoryIndex: (index) => ({ type: "GO_TO_HISTORY_INDEX", index }),
  updateTabViewState: (tabId, pageKey, patch) => ({
    type: "UPDATE_TAB_VIEW_STATE",
    tabId,
    pageKey,
    patch,
  }),
  updateTitle: (title) => ({ type: "UPDATE_TITLE", title }),
  updateTitleForTab: (tabId, title, boardUrl) => ({
    type: "UPDATE_TITLE_FOR_TAB",
    tabId,
    title,
    ...(boardUrl === undefined ? {} : { boardUrl }),
  }),
  reload: () => ({ type: "RELOAD" }),
  followNextThread: (page, options = {}) => ({ type: "FOLLOW_NEXT_THREAD", page, ...options }),
  setAutoRefreshEnabled: (enabled, pageKey) => ({
    type: "SET_AUTO_REFRESH_ENABLED",
    enabled,
    ...(pageKey === undefined ? {} : { pageKey }),
  }),
  splitPane: () => ({ type: "SPLIT_PANE" }),
  openInRightPane: (tabId) => ({ type: "OPEN_IN_RIGHT_PANE", tabId }),
  closePane: () => ({ type: "CLOSE_PANE" }),
  setActivePane: () => ({ type: "SET_ACTIVE_PANE" }),
  moveTabToPane: (tabId, fromPaneId, toPaneId, toIndex) => ({
    type: "MOVE_TAB_TO_PANE",
    tabId,
    fromPaneId,
    toPaneId,
    toIndex,
  }),
  restore: (state) => ({ type: "RESTORE", state }),
};
