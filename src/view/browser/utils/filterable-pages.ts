import type { Page } from "src/view/browser/types";

// 変更理由: ナビバーとコマンドパレットで対象ページがずれないよう、一覧を共有する。
const FILTERABLE_PAGE_TYPES = new Set<Page["type"]>([
  "thread",
  "boardList",
  "threadList",
  "bookmarkList",
  "historyList",
  "writeHistoryList",
  "logList",
]);

export function isPageFilterable(pageType: Page["type"]): boolean {
  return FILTERABLE_PAGE_TYPES.has(pageType);
}
