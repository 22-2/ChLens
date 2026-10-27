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
  registerWritePageTypes,
  WRITE_HISTORY_PAGE_TYPE_DEFINITION,
} from "src/features/write/browser/page-type-definitions";
import type { BrowserCommandDefinition } from "src/view/browser/commands/command-definition";
import { CORE_PAGE_TYPE_DEFINITIONS } from "src/view/browser/core-page-type-definitions";
import { CommandRegistry } from "src/view/browser/extension/command-registry";
import { createExtensionOwner } from "src/view/browser/extension/extension-api";
import type { PageTypeDefinitions } from "src/view/browser/page-type-definitions";

/** 閉じた PageType がすべて定義・登録されることを型で検査する。 */
export const BUILT_IN_PAGE_TYPE_DEFINITIONS: PageTypeDefinitions = {
  ...CORE_PAGE_TYPE_DEFINITIONS,
  boardList: BOARD_PAGE_TYPE_DEFINITION,
  ...THREAD_PAGE_TYPE_DEFINITIONS,
  bookmarkList: BOOKMARK_PAGE_TYPE_DEFINITION,
  writeHistoryList: WRITE_HISTORY_PAGE_TYPE_DEFINITION,
};

const pageTypeRegistryCommandBase = new CommandRegistry<BrowserCommandDefinition>();

/** 画面や復元処理が始まる前に、機能が所有するページ種別を登録する。 */
function registerBuiltInPageTypes(): void {
  const coreApi = createExtensionOwner("core-pages", pageTypeRegistryCommandBase).api;
  coreApi.registerPageType("home", CORE_PAGE_TYPE_DEFINITIONS.home);
  coreApi.registerPageType("newTab", CORE_PAGE_TYPE_DEFINITIONS.newTab);
  coreApi.registerPageType("settings", CORE_PAGE_TYPE_DEFINITIONS.settings);
  coreApi.registerPageType("historyList", CORE_PAGE_TYPE_DEFINITIONS.historyList);
  coreApi.registerPageType("logList", CORE_PAGE_TYPE_DEFINITIONS.logList);

  registerBoardPageTypes(createExtensionOwner("board-pages", pageTypeRegistryCommandBase).api);
  registerThreadPageTypes(createExtensionOwner("thread-pages", pageTypeRegistryCommandBase).api);
  registerBookmarkPageTypes(
    createExtensionOwner("bookmark-pages", pageTypeRegistryCommandBase).api,
  );
  registerWritePageTypes(createExtensionOwner("write-pages", pageTypeRegistryCommandBase).api);
}

registerBuiltInPageTypes();
