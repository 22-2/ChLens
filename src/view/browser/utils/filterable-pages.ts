import { PAGE_TYPE_DEFINITIONS } from "src/view/browser/page-type-definitions";
import type { Page } from "src/view/browser/types";

// 変更理由: ナビバーとコマンドパレットで対象ページがずれないよう、一覧を共有する。
export function isPageFilterable(pageType: Page["type"]): boolean {
  return PAGE_TYPE_DEFINITIONS[pageType].filterable;
}
