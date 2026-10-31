import { useCallback, useMemo } from "react";
import type { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import { clearCachedThreadReadState } from "src/features/thread-list/ui/thread-list-cache";
import {
  COMMAND_REQUEST_IDS,
  type CommandRequest,
  type CommandTarget,
  runCommandRequest,
} from "src/view/browser/commands/command-runtime";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { deleteThreadLogAndCloseTab } from "src/view/browser/commands/thread-log-actions";
import type { useToast } from "src/view/browser/hooks/use-toast";
import type { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { useTabPanes, useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { getCurrentPage } from "src/view/browser/types";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import {
  getBoardUrlFromThreadUrl,
  parseInternalBrowserPage,
} from "src/view/browser/utils/link-routing";
import type { OmnibarSuggestion } from "src/view/browser/utils/omnibar";
import { createBoardPage } from "src/view/browser/utils/tab-pages";

import type { useOmnibarNavigation } from "./use-omnibar-navigation";

export interface MenuPosition {
  x: number;
  y: number;
}

export interface SuggestionMenuState extends MenuPosition {
  suggestion: OmnibarSuggestion;
}

/** オムニバーの候補を右クリックしたときのメニュー項目を、候補の種類に応じて組み立てる。 */
export function useOmnibarSuggestionMenuItems({
  suggestionMenuState,
  openSuggestion,
  dispatch,
  panes,
  runTabCommand,
  toast,
  viewSurface,
}: {
  suggestionMenuState: SuggestionMenuState | null;
  openSuggestion: ReturnType<typeof useOmnibarNavigation>["openSuggestion"];
  dispatch: ReturnType<typeof useTabStore>["dispatch"];
  panes: ReturnType<typeof useTabPanes>["panes"];
  runTabCommand: ReturnType<typeof useTabCommandRunner>;
  toast: ReturnType<typeof useToast>;
  viewSurface: ReturnType<typeof useViewSurface>;
}): ContextMenuItem[] {
  const runSuggestionCommand = useCallback(
    (request: CommandRequest) => {
      void runCommandRequest(request, { surface: viewSurface, toast });
    },
    [toast, viewSurface],
  );
  const suggestionContextMenuItems = useMemo<ContextMenuItem[]>(() => {
    const state = suggestionMenuState;
    if (!state) return [];

    const { suggestion } = state;
    const resolvedPage = parseInternalBrowserPage(suggestion.url);
    const targetPage =
      resolvedPage?.type === "thread"
        ? { ...resolvedPage, title: suggestion.title }
        : resolvedPage?.type === "threadList"
          ? {
              ...resolvedPage,
              title: suggestion.title,
              boardTitle: suggestion.boardTitle || suggestion.title,
            }
          : null;
    const target: CommandTarget | null =
      resolvedPage?.type === "thread"
        ? { kind: "thread", title: suggestion.title, url: resolvedPage.threadUrl }
        : resolvedPage?.type === "threadList"
          ? {
              kind: "board",
              title: suggestion.boardTitle || suggestion.title,
              url: resolvedPage.boardUrl,
            }
          : null;
    const items: ContextMenuItem[] = [];

    if (targetPage) {
      items.push(
        {
          id: "open-current",
          label: "このタブで開く",
          onSelect: () => openSuggestion(suggestion),
        },
        {
          id: "open-new-tab",
          label: "新しいタブで開く",
          onSelect: () => dispatch(tabActions.openInNewTabForce(targetPage, { focus: true })),
        },
      );
    }

    if (target) {
      items.push({ id: "suggestion-actions-separator", separator: true });
      items.push({
        id: "bookmark-toggle",
        label: "ブックマークを切り替え",
        onSelect: () =>
          runSuggestionCommand({
            id: COMMAND_REQUEST_IDS.TARGET_BOOKMARK_TOGGLE,
            args: { target },
          }),
      });
      items.push(
        {
          id: "copy-title",
          label: target.kind === "thread" ? "スレタイをコピー" : "板名をコピー",
          onSelect: () =>
            runSuggestionCommand({
              id: COMMAND_REQUEST_IDS.TARGET_COPY,
              args: { target, format: "title" },
            }),
        },
        {
          id: "copy-url",
          label: "URLをコピー",
          onSelect: () =>
            runSuggestionCommand({
              id: COMMAND_REQUEST_IDS.TARGET_COPY,
              args: { target, format: "url" },
            }),
        },
        {
          id: "copy-title-url",
          label: target.kind === "thread" ? "スレタイ＆URLをコピー" : "板名＆URLをコピー",
          onSelect: () =>
            runSuggestionCommand({
              id: COMMAND_REQUEST_IDS.TARGET_COPY,
              args: { target, format: "title-url" },
            }),
        },
      );
    } else {
      items.push({
        id: "copy-url",
        label: "URLをコピー",
        onSelect: () =>
          runSuggestionCommand({
            id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT,
            args: { text: suggestion.url },
          }),
      });
    }

    if (resolvedPage?.type === "thread") {
      const boardUrl = getBoardUrlFromThreadUrl(resolvedPage.threadUrl);
      const threadUrl = resolvedPage.threadUrl;
      const openThreadTabIds = panes
        .flatMap((pane) => pane.tabs)
        .filter((tab) => {
          const page = getCurrentPage(tab);
          return !tab.pinned && page.type === "thread" && page.threadUrl === threadUrl;
        })
        .map((tab) => tab.id);

      items.push(
        { id: "thread-actions-separator", separator: true },
        {
          id: "open-board",
          label: "板を新しいタブで開く",
          onSelect: () =>
            dispatch(
              tabActions.openInNewTabForce(createBoardPage(boardUrl, suggestion.boardTitle), {
                focus: true,
              }),
            ),
        },
        {
          id: "delete-thread-log",
          label:
            openThreadTabIds.length > 0
              ? "スレログと閲覧履歴を削除してタブを閉じる"
              : "スレログと閲覧履歴を削除",
          danger: true,
          onSelect: () => {
            void deleteThreadLogAndCloseTab({
              threadUrl,
              closeTab: () => {
                let didCloseTab = false;
                for (const tabId of openThreadTabIds) {
                  didCloseTab = runTabCommand(TAB_COMMAND_IDS.CLOSE, { tabId }) || didCloseTab;
                }
                return didCloseTab;
              },
              clearCachedReadState: clearCachedThreadReadState,
              toast,
            });
          },
        },
      );
    }

    items.push({
      id: "open-in-browser",
      label: "ブラウザで開く",
      onSelect: () => viewSurface.window.open(suggestion.url, "_blank", "noopener,noreferrer"),
    });
    return items;
  }, [
    dispatch,
    openSuggestion,
    panes,
    runSuggestionCommand,
    runTabCommand,
    suggestionMenuState,
    toast,
    viewSurface,
  ]);
  return suggestionContextMenuItems;
}
