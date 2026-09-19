import type { Page } from "src/view/browser/types";

// 変更理由: 更新ボタンがタブバー、タイトルバー、コンテキストメニューの複数箇所に置かれるため、再取得可否の判定を共有する。
export function isPageRefreshable(page: Page): boolean {
  return (
    page.type === "boardList" ||
    page.type === "thread" ||
    page.type === "threadList" ||
    page.type === "historyList" ||
    page.type === "writeHistoryList" ||
    page.type === "logList"
  );
}
