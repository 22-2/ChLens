import type { ExtensionApi } from "src/view/browser/extension/extension-api";
import type { PageOfType, PageTypeDefinition } from "src/view/browser/page-type-definitions";
import { WriteIcon } from "src/view/browser/ui/icons";

export const WRITE_HISTORY_PAGE_TYPE_DEFINITION = {
  icon: WriteIcon,
  refreshable: true,
  filterable: true,
  autoRefreshable: false,
  displayLabel: "書き込み履歴",
} satisfies PageTypeDefinition<PageOfType<"writeHistoryList">>;

/** write 機能が所有する書き込み履歴の共通メタデータを登録する。 */
export function registerWritePageTypes(api: ExtensionApi): void {
  api.registerPageType("writeHistoryList", WRITE_HISTORY_PAGE_TYPE_DEFINITION);
}
