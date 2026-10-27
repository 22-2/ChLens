import { Bookmark, Star } from "lucide-react";
import { container } from "src/service-container";
import {
  type BrowserCommandContext,
  getCommandPageTarget,
  getCommandSurface,
  getCommandToast,
} from "src/view/browser/commands/command-definition";
import {
  COMMAND_REQUEST_IDS,
  executeCommandRequest,
} from "src/view/browser/commands/command-runtime";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";
import { createQuickAccessPage } from "src/view/browser/utils/tab-pages";

async function toggleBookmark(context: BrowserCommandContext): Promise<void> {
  const target = getCommandPageTarget(context.viewPage);
  if (!target) return;

  const isBookmarked = Boolean(container.bookmark.get(target.url));
  // 変更理由: パレットとコンテキストメニューで保存処理と表示先通知を共有するため、対象付き要求へ委譲する。
  await executeCommandRequest(
    { id: COMMAND_REQUEST_IDS.TARGET_BOOKMARK_TOGGLE, args: { target } },
    { surface: getCommandSurface(context), toast: getCommandToast(context) },
  );
  getCommandToast(context).info(
    isBookmarked ? "ブックマークを削除しました" : "ブックマークに追加しました",
  );
}

/** bookmark 機能が所有するお気に入り関連コマンドを登録する。 */
export function registerBookmarkCommands(api: ExtensionApi): void {
  api.addCommand(
    {
      id: "bookmark.open-list",
      label: "ブックマークリストを開く",
      englishLabel: "Open Bookmarks",
      keywords: ["お気に入り", "favorite", "bookmark"],
      group: "navigation",
      icon: Bookmark,
      run: (context) => api.workspace.openPage(context, createQuickAccessPage("bookmarkList")),
    },
    { beforeCommandId: "navigation.open-history" },
  );
  api.addCommand(
    {
      id: "bookmark.toggle",
      label: "現在のページのブックマークを切り替え",
      englishLabel: "Toggle Bookmark for Current Page",
      keywords: ["お気に入り", "star", "bookmark"],
      group: "page",
      icon: Star,
      when: ({ viewPage }) => getCommandPageTarget(viewPage) != null,
      run: toggleBookmark,
    },
    { beforeCommandId: "page.open-board" },
  );
}
