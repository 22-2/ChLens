import { Bookmark, Star } from "lucide-react";
import { container } from "src/service-container";
import type { BrowserCommandContext } from "src/view/browser/commands/browser-commands";
import {
  COMMAND_REQUEST_IDS,
  type CommandTarget,
  executeCommandRequest,
} from "src/view/browser/commands/command-runtime";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";
import type { ViewSurface } from "src/view/browser/hooks/use-view-surface";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { Page } from "src/view/browser/types";
import { createQuickAccessPage } from "src/view/browser/utils/tab-pages";

function getCommandSurface(context: BrowserCommandContext): ViewSurface {
  return (
    context.viewSurface ?? {
      window: globalThis.window,
      document: globalThis.document,
    }
  );
}

function getBookmarkCommandTarget(page: Page): CommandTarget | null {
  switch (page.type) {
    case "thread":
      return {
        url: page.threadUrl,
        title: page.title || page.threadUrl,
        kind: "thread",
      };
    case "threadList":
      return {
        url: page.boardUrl,
        title: page.boardTitle || page.title || page.boardUrl,
        kind: "board",
      };
    default:
      return null;
  }
}

async function toggleBookmark(context: BrowserCommandContext): Promise<void> {
  const target = getBookmarkCommandTarget(context.viewPage);
  if (!target) return;

  const isBookmarked = Boolean(container.bookmark.get(target.url));
  // 変更理由: パレットとコンテキストメニューで保存処理と表示先通知を共有するため、対象付き要求へ委譲する。
  await executeCommandRequest(
    { id: COMMAND_REQUEST_IDS.TARGET_BOOKMARK_TOGGLE, args: { target } },
    { surface: getCommandSurface(context), toast: context.toast ?? container.toast },
  );
  (context.toast ?? container.toast).info(
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
      run: (context) =>
        context.dispatch(tabActions.navigate(createQuickAccessPage("bookmarkList"))),
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
      when: ({ viewPage }) => getBookmarkCommandTarget(viewPage) != null,
      run: toggleBookmark,
    },
    { beforeCommandId: "page.open-board" },
  );
}
