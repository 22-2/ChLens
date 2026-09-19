export const QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE = {
  boardList: "board-list-filter-toolbar-toggle",
  bookmarkList: "bookmark-filter-toolbar-toggle",
  historyList: "history-filter-toolbar-toggle",
  writeHistoryList: "write-history-filter-toolbar-toggle",
  logList: "log-filter-toolbar-toggle",
  threadList: "thread-list-filter-toolbar-toggle",
} as const;

// ステータスバーからスレッドのフィルタバーを開くための専用イベント。
// 変更理由: 既存のtoggleイベントを使うと、すでに表示中のバーをクリック時に閉じてしまうため、
// 「開く」操作は表示状態を反転させず、対象タブだけへ届ける。
export const THREAD_FILTER_TOOLBAR_OPEN_EVENT = "thread-filter-toolbar-open";

export interface ThreadFilterToolbarOpenDetail {
  tabId: string;
}

export type QuickAccessFilterPageType = keyof typeof QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE;

export interface QuickAccessFilterToggleDetail {
  tabId: string;
}
