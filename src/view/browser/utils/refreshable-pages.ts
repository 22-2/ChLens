import { getPageTypeDefinitionByType } from "src/view/browser/page-type-definitions";
import type { Page } from "src/view/browser/types";

// 変更理由: 更新ボタンがタブバー、タイトルバー、コンテキストメニューの複数箇所に置かれるため、再取得可否の判定を共有する。
export function isPageRefreshable(page: Page): boolean {
  return getPageTypeDefinitionByType(page.type).refreshable;
}
