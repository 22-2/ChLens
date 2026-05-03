export const QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE = {
  historyList: "history-filter-toolbar-toggle",
  writeHistoryList: "write-history-filter-toolbar-toggle",
} as const;

export type QuickAccessFilterPageType =
  keyof typeof QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE;

export interface QuickAccessFilterToggleDetail {
  tabId: string;
}
