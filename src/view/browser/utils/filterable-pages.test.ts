import { isPageFilterable } from "src/view/browser/utils/filterable-pages";
import { describe, expect, it } from "vite-plus/test";

describe("フィルター対象ページ", () => {
  it.each([
    "thread",
    "boardList",
    "threadList",
    "bookmarkList",
    "historyList",
    "writeHistoryList",
    "logList",
  ] as const)("%sではフィルターを利用できる", (pageType) => {
    expect(isPageFilterable(pageType)).toBe(true);
  });

  it.each(["home", "newTab", "settings"] as const)("%sではフィルターを利用できない", (pageType) => {
    expect(isPageFilterable(pageType)).toBe(false);
  });
});
