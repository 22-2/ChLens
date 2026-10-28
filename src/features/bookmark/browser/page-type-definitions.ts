import type { ExtensionApi } from "src/view/browser/extension/extension-api";
import type { PageOfType, PageTypeDefinition } from "src/view/browser/page-type-definitions";
import { BookmarkIcon } from "src/view/browser/ui/icons";

export const BOOKMARK_PAGE_TYPE_DEFINITION = {
  icon: BookmarkIcon,
  refreshable: false,
  filterable: true,
  autoRefreshable: false,
  displayLabel: "ブックマーク",
} satisfies PageTypeDefinition<PageOfType<"bookmarkList">>;

/** bookmark 機能が所有する一覧ページの共通メタデータを登録する。 */
export function registerBookmarkPageTypes(api: ExtensionApi): void {
  api.registerPageType("bookmarkList", BOOKMARK_PAGE_TYPE_DEFINITION);
}
