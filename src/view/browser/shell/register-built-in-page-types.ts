import {
  BOARD_PAGE_TYPE_DEFINITION,
  registerBoardPageTypes,
} from "src/features/board/browser/page-type-definitions";
import {
  BOOKMARK_PAGE_TYPE_DEFINITION,
  registerBookmarkPageTypes,
} from "src/features/bookmark/browser/page-type-definitions";
import {
  registerThreadPageTypes,
  THREAD_PAGE_TYPE_DEFINITIONS,
} from "src/features/thread/browser/page-type-definitions";
import {
  registerThreadListPageTypes,
  THREAD_LIST_PAGE_TYPE_DEFINITION,
} from "src/features/thread-list/browser/page-type-definitions";
import {
  registerWritePageTypes,
  WRITE_HISTORY_PAGE_TYPE_DEFINITION,
} from "src/features/write/browser/page-type-definitions";
import { CORE_PAGE_TYPE_DEFINITIONS } from "src/view/browser/core-page-type-definitions";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";
import type { PageTypeDefinitions } from "src/view/browser/page-type-definitions";

/** 閉じた PageType がすべて定義されることを型で検査する。 */
export const BUILT_IN_PAGE_TYPE_DEFINITIONS: PageTypeDefinitions = {
  ...CORE_PAGE_TYPE_DEFINITIONS,
  boardList: BOARD_PAGE_TYPE_DEFINITION,
  ...THREAD_PAGE_TYPE_DEFINITIONS,
  threadList: THREAD_LIST_PAGE_TYPE_DEFINITION,
  bookmarkList: BOOKMARK_PAGE_TYPE_DEFINITION,
  writeHistoryList: WRITE_HISTORY_PAGE_TYPE_DEFINITION,
};

/** 描画やセッション復元より先に、各機能の所有者へページ種別を登録する。 */
export function registerBuiltInPageTypes(getApi: (ownerId: string) => ExtensionApi): void {
  const coreApi = getApi("core");
  coreApi.registerPageType("home", CORE_PAGE_TYPE_DEFINITIONS.home);
  coreApi.registerPageType("newTab", CORE_PAGE_TYPE_DEFINITIONS.newTab);
  coreApi.registerPageType("settings", CORE_PAGE_TYPE_DEFINITIONS.settings);
  coreApi.registerPageType("historyList", CORE_PAGE_TYPE_DEFINITIONS.historyList);
  coreApi.registerPageType("logList", CORE_PAGE_TYPE_DEFINITIONS.logList);
  coreApi.registerPageType("about", CORE_PAGE_TYPE_DEFINITIONS.about);

  registerBoardPageTypes(getApi("board"));
  registerThreadPageTypes(getApi("thread"));
  registerThreadListPageTypes(getApi("thread-list"));
  registerBookmarkPageTypes(getApi("bookmark"));
  registerWritePageTypes(getApi("write"));
}
