import type { ExtensionApi } from "src/view/browser/extension/extension-api";
import type { PageOfType, PageTypeDefinition } from "src/view/browser/page-type-definitions";
import { ThreadListIcon } from "src/view/browser/ui/icons";

export const THREAD_LIST_PAGE_TYPE_DEFINITION: PageTypeDefinition<PageOfType<"threadList">> = {
  icon: ThreadListIcon,
  refreshable: true,
  filterable: true,
  autoRefreshable: true,
  getLocation: (page) => page.boardUrl,
};

/** スレ一覧が所有するページ種別を登録する。 */
export function registerThreadListPageTypes(api: ExtensionApi): void {
  api.registerPageType("threadList", THREAD_LIST_PAGE_TYPE_DEFINITION);
}
