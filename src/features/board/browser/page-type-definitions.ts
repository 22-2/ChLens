import type { ExtensionApi } from "src/view/browser/extension/extension-api";
import type { PageOfType, PageTypeDefinition } from "src/view/browser/page-type-definitions";
import { BoardListIcon } from "src/view/browser/ui/icons";

export const BOARD_PAGE_TYPE_DEFINITION = {
  icon: BoardListIcon,
  refreshable: true,
  filterable: true,
  autoRefreshable: false,
  displayLabel: "板一覧",
} satisfies PageTypeDefinition<PageOfType<"boardList">>;

/** board 機能が所有する板一覧の共通メタデータを登録する。 */
export function registerBoardPageTypes(api: ExtensionApi): void {
  api.registerPageType("boardList", BOARD_PAGE_TYPE_DEFINITION);
}
