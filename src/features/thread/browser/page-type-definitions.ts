import { createHomePage } from "src/view/browser/core-page-type-definitions";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";
import { type PageOfType, type PageTypeDefinition } from "src/view/browser/page-type-definitions";
import { ThreadIcon } from "src/view/browser/ui/icons";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";

export const THREAD_PAGE_TYPE_DEFINITIONS = {
  thread: {
    icon: ThreadIcon,
    refreshable: true,
    filterable: true,
    autoRefreshable: true,
    getLocation: (page) => page.threadUrl,
    // 板一覧はホームから明示的に開く入口に限定し、祖先として自動生成しない。
    // スレッドには板を祖先に含め、新規タブで開いたスレから同じ板へ戻れるようにする。
    buildHierarchy: (page) => {
      // 変更理由: 板URLの形式ごとの差をUIのページ階層へ持ち込まないため、導出は共通処理へ委譲する。
      const boardUrl = getBoardUrlFromThreadUrl(page.threadUrl);
      return [
        createHomePage(),
        { type: "threadList", title: boardUrl, boardUrl, boardTitle: boardUrl },
        page,
      ];
    },
  },
} satisfies {
  thread: PageTypeDefinition<PageOfType<"thread">>;
};

/** thread 機能が所有するスレッドの共通メタデータを登録する。 */
export function registerThreadPageTypes(api: ExtensionApi): void {
  api.registerPageType("thread", THREAD_PAGE_TYPE_DEFINITIONS.thread);
}
