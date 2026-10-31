import {
  COMMAND_REQUEST_IDS,
  type CommandRequest,
  type CommandTarget,
} from "src/view/browser/commands/command-runtime";
import type { useTabPanes } from "src/view/browser/state/tabs/use-tab-store";
import { getCurrentPage, type Page } from "src/view/browser/types";
import {
  getBoardUrlFromThreadUrl,
  parseInternalBrowserPage,
} from "src/view/browser/utils/link-routing";
import type { OmnibarSuggestion } from "src/view/browser/utils/omnibar";
import { createBoardPage } from "src/view/browser/utils/tab-pages";

/**
 * 候補メニューの項目が「何をするか」を表すデータ。
 * 組み立て（buildOmnibarSuggestionMenuEntries）は副作用を持たず、実行は omnibar-suggestion-menu-actions が行う。
 */
export type OmnibarSuggestionMenuAction =
  | { type: "open-current"; suggestion: OmnibarSuggestion }
  | { type: "open-new-tab"; page: Page }
  | { type: "run-command"; request: CommandRequest }
  | { type: "delete-thread-log"; threadUrl: string; tabIds: readonly string[] }
  | { type: "open-in-browser"; url: string };

export type OmnibarSuggestionMenuEntry =
  | { id: string; separator: true }
  | {
      id: string;
      label: string;
      danger?: boolean;
      action: OmnibarSuggestionMenuAction;
    };

function separator(id: string): OmnibarSuggestionMenuEntry {
  return { id, separator: true };
}

function copyEntries(target: CommandTarget): OmnibarSuggestionMenuEntry[] {
  const isThread = target.kind === "thread";
  return [
    {
      id: "copy-title",
      label: isThread ? "スレタイをコピー" : "板名をコピー",
      action: {
        type: "run-command",
        request: { id: COMMAND_REQUEST_IDS.TARGET_COPY, args: { target, format: "title" } },
      },
    },
    {
      id: "copy-url",
      label: "URLをコピー",
      action: {
        type: "run-command",
        request: { id: COMMAND_REQUEST_IDS.TARGET_COPY, args: { target, format: "url" } },
      },
    },
    {
      id: "copy-title-url",
      label: isThread ? "スレタイ＆URLをコピー" : "板名＆URLをコピー",
      action: {
        type: "run-command",
        request: { id: COMMAND_REQUEST_IDS.TARGET_COPY, args: { target, format: "title-url" } },
      },
    },
  ];
}

/** 開いているスレッドのタブのうち、ピン留めされていないものを閉じ対象として集める。 */
function findOpenThreadTabIds(
  panes: ReturnType<typeof useTabPanes>["panes"],
  threadUrl: string,
): string[] {
  return panes
    .flatMap((pane) => pane.tabs)
    .filter((tab) => {
      const page = getCurrentPage(tab);
      return !tab.pinned && page.type === "thread" && page.threadUrl === threadUrl;
    })
    .map((tab) => tab.id);
}

/** オムニバーの候補を右クリックしたときのメニュー項目を、候補の種類に応じて組み立てる。副作用は持たない。 */
export function buildOmnibarSuggestionMenuEntries(
  suggestion: OmnibarSuggestion,
  panes: ReturnType<typeof useTabPanes>["panes"],
): OmnibarSuggestionMenuEntry[] {
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
  const entries: OmnibarSuggestionMenuEntry[] = [];

  if (targetPage) {
    entries.push(
      { id: "open-current", label: "このタブで開く", action: { type: "open-current", suggestion } },
      {
        id: "open-new-tab",
        label: "新しいタブで開く",
        action: { type: "open-new-tab", page: targetPage },
      },
    );
  }

  if (target) {
    entries.push(
      separator("suggestion-actions-separator"),
      {
        id: "bookmark-toggle",
        label: "ブックマークを切り替え",
        action: {
          type: "run-command",
          request: { id: COMMAND_REQUEST_IDS.TARGET_BOOKMARK_TOGGLE, args: { target } },
        },
      },
      ...copyEntries(target),
    );
  } else {
    entries.push({
      id: "copy-url",
      label: "URLをコピー",
      action: {
        type: "run-command",
        request: { id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT, args: { text: suggestion.url } },
      },
    });
  }

  if (resolvedPage?.type === "thread") {
    const threadUrl = resolvedPage.threadUrl;
    const openThreadTabIds = findOpenThreadTabIds(panes, threadUrl);
    entries.push(
      separator("thread-actions-separator"),
      {
        id: "open-board",
        label: "板を新しいタブで開く",
        action: {
          type: "open-new-tab",
          page: createBoardPage(getBoardUrlFromThreadUrl(threadUrl), suggestion.boardTitle),
        },
      },
      {
        id: "delete-thread-log",
        label:
          openThreadTabIds.length > 0
            ? "スレログと閲覧履歴を削除してタブを閉じる"
            : "スレログと閲覧履歴を削除",
        danger: true,
        action: { type: "delete-thread-log", threadUrl, tabIds: openThreadTabIds },
      },
    );
  }

  entries.push({
    id: "open-in-browser",
    label: "ブラウザで開く",
    action: { type: "open-in-browser", url: suggestion.url },
  });
  return entries;
}
