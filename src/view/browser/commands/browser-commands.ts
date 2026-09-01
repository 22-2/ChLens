import {
  Archive,
  Bookmark,
  Clipboard,
  Columns2,
  ExternalLink,
  Filter,
  Hash,
  History,
  Import,
  List,
  PenLine,
  RotateCw,
  Search,
  Settings,
  Star,
  type LucideIcon,
} from "lucide-react";
import { ChURL, HOSTNAME } from "packages/ch-lib/src/index";
import type { Dispatch } from "react";
import { container } from "src/service-container";
import type { ScopedTabAction } from "src/view/browser/hooks/use-tab-store";
import type { Page, Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";
import {
  canQueryExtensionTabs,
  getOpenCompatibleThreadPages,
  removeExtensionTabs,
} from "src/view/browser/utils/extension-tabs";
import {
  QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE,
  type QuickAccessFilterPageType,
} from "src/view/browser/utils/filter-toolbar-events";
import {
  getBoardUrlFromThreadUrl,
  parseInternalBrowserPage,
  parseInternalBrowserPageStrict,
} from "src/view/browser/utils/link-routing";
import { encodeThreadAsToon, estimateToonTokenCount } from "src/view/browser/utils/thread-toon";
import { copyText, formatMarkdownLink } from "src/view/browser/utils/clipboard";

export const BROWSER_COMMAND_GROUP_LABELS = {
  navigation: "移動",
  page: "現在のページ",
  layout: "表示",
  copy: "コピー",
} as const;

export type BrowserCommandGroup = keyof typeof BROWSER_COMMAND_GROUP_LABELS;

export const BROWSER_COMMAND_GROUP_ORDER: readonly BrowserCommandGroup[] = [
  "navigation",
  "page",
  "layout",
  "copy",
];

export interface BrowserCommandContext {
  currentPage: Page;
  activeTab: Tab;
  tabs: readonly Tab[];
  isTwoPane: boolean;
  isWritePanelOpen: boolean;
  dispatch: Dispatch<ScopedTabAction>;
  toggleWritePanel: () => void;
  openResponseJumpDialog: () => void;
  openNextThreadSearchDialog: () => Promise<void>;
}

export interface BrowserCommandDefinition {
  id: string;
  label: string | ((context: BrowserCommandContext) => string);
  englishLabel: string | ((context: BrowserCommandContext) => string);
  description?: string;
  keywords?: readonly string[];
  group: BrowserCommandGroup;
  icon: LucideIcon;
  when?: (context: BrowserCommandContext) => boolean;
  isEnabled?: (context: BrowserCommandContext) => boolean;
  run: (context: BrowserCommandContext) => void | Promise<void>;
}

export interface ResolvedBrowserCommand {
  id: string;
  label: string;
  englishLabel: string;
  description?: string;
  keywords: readonly string[];
  group: BrowserCommandGroup;
  icon: LucideIcon;
  enabled: boolean;
}

interface CommandPageTarget {
  url: string;
  title: string;
  bookmarkType: "thread" | "board";
}

type QuickAccessPage = Extract<
  Page,
  {
    type: "bookmarkList" | "historyList" | "writeHistoryList" | "logList";
  }
>;

const RELOADABLE_PAGE_TYPES = new Set<Page["type"]>([
  "thread",
  "threadList",
  "historyList",
  "writeHistoryList",
  "logList",
]);

const FILTERABLE_PAGE_TYPES = new Set<Page["type"]>([
  "thread",
  "boardList",
  "threadList",
  "bookmarkList",
  "historyList",
  "writeHistoryList",
  "logList",
]);

export function getCommandPageTarget(page: Page): CommandPageTarget | null {
  switch (page.type) {
    case "thread":
      return {
        url: page.threadUrl,
        title: page.title || page.threadUrl,
        bookmarkType: "thread",
      };

    case "threadList":
      return {
        url: page.boardUrl,
        title: page.boardTitle || page.title || page.boardUrl,
        bookmarkType: "board",
      };

    default:
      return null;
  }
}

function getNormalizedCommandPageUrl(page: Page): string | null {
  const target = getCommandPageTarget(page);
  if (!target) return null;

  const parsed = parseInternalBrowserPage(target.url);
  const normalizedUrl =
    parsed?.type === "thread"
      ? parsed.threadUrl
      : parsed?.type === "threadList"
        ? parsed.boardUrl
        : target.url;

  try {
    const hostname = new URL(normalizedUrl).hostname;
    // 変更理由: itest URLのoriginからdat/subject.txtを組み立てても取得不能なので、
    // bbsmenu由来の実サーバーへ解決できなかった場合はコマンド自体を隠す。
    if (hostname === HOSTNAME.ITEST_5CH || hostname === HOSTNAME.ITEST_BBSPINK) {
      return null;
    }
  } catch {
    return null;
  }

  return normalizedUrl;
}

function deriveRawUrl(page: Page, derive: (url: ChURL) => string | null): string | null {
  const normalizedUrl = getNormalizedCommandPageUrl(page);
  if (!normalizedUrl) return null;

  try {
    return derive(new ChURL(normalizedUrl));
  } catch {
    return null;
  }
}

export function getSubjectUrlForCommand(page: Page): string | null {
  return deriveRawUrl(page, (url) => url.getSubjectUrl());
}

export function getDatUrlForCommand(page: Page): string | null {
  if (page.type !== "thread") return null;
  return deriveRawUrl(page, (url) => url.getDatUrl());
}

function getBoardPageFromThread(page: Page): Extract<Page, { type: "threadList" }> | null {
  if (page.type !== "thread") return null;

  const boardUrl = getBoardUrlFromThreadUrl(page.threadUrl);
  if (boardUrl === page.threadUrl) return null;

  return {
    type: "threadList",
    title: boardUrl,
    boardUrl,
    boardTitle: boardUrl,
  };
}

function openSettings(context: BrowserCommandContext): void {
  const existingSettingsTab = context.tabs.find((tab) => getCurrentPage(tab).type === "settings");

  if (existingSettingsTab) {
    context.dispatch({ type: "SELECT_TAB", tabId: existingSettingsTab.id });
    return;
  }

  context.dispatch({ type: "ADD_TAB" });
  context.dispatch({
    type: "NAVIGATE",
    page: { type: "settings", title: "設定" },
  });
}

function openQuickAccessPage(context: BrowserCommandContext, page: QuickAccessPage): void {
  context.dispatch({ type: "NAVIGATE", page });
}

async function importOpenThreadTabs(context: BrowserCommandContext): Promise<void> {
  const openThreadPages = await getOpenCompatibleThreadPages();
  const existingThreadUrls = new Set(
    context.tabs
      .map((tab) => getCurrentPage(tab))
      .filter((page): page is Extract<Page, { type: "thread" }> => page.type === "thread")
      // 変更理由: 既存のアプリ内タブが旧5ch.net URLを保持していても、
      // ブラウザ側で正規化した5ch.io URLと同じスレッドとして重複排除するため。
      .map((page) => {
        const normalizedPage = parseInternalBrowserPageStrict(page.threadUrl);
        return normalizedPage?.type === "thread" ? normalizedPage.threadUrl : page.threadUrl;
      }),
  );
  const pagesToImport = openThreadPages.filter(
    ({ page }) => !existingThreadUrls.has(page.threadUrl),
  );

  if (pagesToImport.length === 0) {
    container.toast.info("取り込める新しいスレタブはありません");
    return;
  }

  let failedTabCount = 0;
  for (const { page, tabIds } of pagesToImport) {
    // 変更理由: 一括取り込みで表示中のページを奪わず、確認したいタブを利用者が選べるよう
    // すべてバックグラウンド追加に統一し、追加できたページに対応する元タブだけを閉じる。
    context.dispatch({ type: "OPEN_IN_NEW_TAB", page, background: true });

    const failedTabIds = await removeExtensionTabs(tabIds);
    if (failedTabIds.length > 0) {
      failedTabCount += failedTabIds.length;
      console.error("[ChLens] スレッド取り込み元タブの一部を閉じられませんでした", {
        threadUrl: page.threadUrl,
        failedTabIds,
      });
    }
  }

  if (failedTabCount > 0) {
    container.toast.error(
      `${pagesToImport.length.toLocaleString("ja-JP")}件のスレタブを取り込みましたが、` +
        `元ブラウザタブ${failedTabCount.toLocaleString("ja-JP")}件を閉じられませんでした`,
    );
    return;
  }

  container.toast.success(
    `${pagesToImport.length.toLocaleString("ja-JP")}件のスレタブを取り込みました`,
  );
}

function toggleFilter(context: BrowserCommandContext): void {
  if (context.currentPage.type === "thread") {
    window.dispatchEvent(new window.CustomEvent("thread-filter-toolbar-toggle"));
    return;
  }

  const pageType = context.currentPage.type as QuickAccessFilterPageType;
  const eventName = QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE[pageType];
  if (!eventName) return;

  window.dispatchEvent(
    new window.CustomEvent(eventName, {
      detail: { tabId: context.activeTab.id },
    }),
  );
}

function toggleBookmark(context: BrowserCommandContext): void {
  const target = getCommandPageTarget(context.currentPage);
  if (!target) return;

  const isBookmarked = Boolean(container.bookmark.get(target.url));
  if (isBookmarked) {
    container.bookmark.remove(target.url);
    container.toast.info("ブックマークを削除しました");
    return;
  }

  container.bookmark.add({
    url: target.url,
    title: target.title,
    type: target.bookmarkType,
  });
  container.toast.info("ブックマークに追加しました");
}

async function copyWithNotice(text: string, label: string): Promise<void> {
  await copyText(text);
  container.toast.success(`${label}をコピーしました`);
}

async function retryBoardTitle(context: BrowserCommandContext): Promise<void> {
  const page = context.currentPage;
  if (page.type !== "threadList") return;

  // 板名解決系は旧コアと拡張機能APIへ依存するため、コマンド実行時だけ読み込む。
  const { askByUrl } = await import("src/core/BoardTitleSolver.js");
  const title = await askByUrl(page.boardUrl);
  if (!title) {
    throw new Error(`板名を取得できませんでした: ${page.boardUrl}`);
  }

  // 変更理由: 通信完了までに別ページへ移動しても、板URLを手掛かりに
  // 対象タブの履歴中にある板一覧へ取得結果を反映できるようにする。
  context.dispatch({
    type: "UPDATE_TITLE_FOR_TAB",
    tabId: context.activeTab.id,
    title,
    boardUrl: page.boardUrl,
  });
  container.toast.success(`板名を「${title}」に更新しました`);
}

function getCommandLabel(
  label: BrowserCommandDefinition["label"],
  context: BrowserCommandContext,
): string {
  return typeof label === "function" ? label(context) : label;
}

export const BROWSER_COMMAND_DEFINITIONS: readonly BrowserCommandDefinition[] = [
  {
    id: "navigation.open-settings",
    label: "設定を開く",
    englishLabel: "Open Settings",
    description: "アプリの設定画面を開きます",
    keywords: ["preferences", "config", "オプション"],
    group: "navigation",
    icon: Settings,
    run: openSettings,
  },
  {
    id: "navigation.open-bookmarks",
    label: "ブックマークリストを開く",
    englishLabel: "Open Bookmarks",
    keywords: ["お気に入り", "favorite", "bookmark"],
    group: "navigation",
    icon: Bookmark,
    run: (context) =>
      openQuickAccessPage(context, {
        type: "bookmarkList",
        title: "ブックマークリスト",
      }),
  },
  {
    id: "navigation.open-history",
    label: "閲覧履歴を開く",
    englishLabel: "Open Browsing History",
    keywords: ["history", "最近見た"],
    group: "navigation",
    icon: History,
    run: (context) =>
      openQuickAccessPage(context, {
        type: "historyList",
        title: "閲覧履歴",
      }),
  },
  {
    id: "navigation.open-write-history",
    label: "書き込み履歴を開く",
    englishLabel: "Open Post History",
    keywords: ["投稿履歴", "write history"],
    group: "navigation",
    icon: PenLine,
    run: (context) =>
      openQuickAccessPage(context, {
        type: "writeHistoryList",
        title: "書き込み履歴",
      }),
  },
  {
    id: "navigation.open-log-search",
    label: "ログ検索を開く",
    englishLabel: "Open Archive Search",
    keywords: ["過去ログ", "archive", "log"],
    group: "navigation",
    icon: Archive,
    run: (context) =>
      openQuickAccessPage(context, {
        type: "logList",
        title: "ログ検索",
      }),
  },
  {
    id: "navigation.import-open-thread-tabs",
    label: "開いているスレタブをすべて取り込む",
    englishLabel: "Import All Open Thread Tabs",
    description: "ブラウザで開いている5ch互換スレをアプリのタブとして追加します",
    keywords: ["一括", "import", "browser tabs", "5ch", "スレッド"],
    group: "navigation",
    icon: Import,
    when: canQueryExtensionTabs,
    run: importOpenThreadTabs,
  },
  {
    id: "page.reload",
    label: "現在のページを更新",
    englishLabel: "Reload Current Page",
    keywords: ["再読み込み", "reload", "refresh"],
    group: "page",
    icon: RotateCw,
    when: ({ currentPage }) => RELOADABLE_PAGE_TYPES.has(currentPage.type),
    run: ({ dispatch }) => dispatch({ type: "RELOAD" }),
  },
  {
    id: "page.retry-board-title",
    label: "板名を再取得",
    englishLabel: "Retry Board Title",
    description: "板一覧やSETTING.TXTから現在の板名を再取得します",
    keywords: ["板タイトル", "板名更新", "再試行", "retry", "board title"],
    group: "page",
    icon: RotateCw,
    when: ({ currentPage }) => currentPage.type === "threadList",
    run: retryBoardTitle,
  },
  {
    id: "page.jump-to-response",
    label: "レス番号を指定してジャンプ",
    englishLabel: "Jump to Response Number",
    description: "入力ダイアログでレス番号を指定します",
    keywords: ["レス移動", "番号", "jump", "response"],
    group: "page",
    icon: Hash,
    when: ({ currentPage }) => currentPage.type === "thread",
    run: ({ openResponseJumpDialog }) => openResponseJumpDialog(),
  },
  {
    id: "page.search-next-thread",
    label: "次スレ候補を検索",
    englishLabel: "Find Next Thread Candidates",
    description: "積極判定で現在のスレに続く候補を一覧表示します",
    keywords: ["次スレ", "候補", "thread", "next", "search"],
    group: "page",
    icon: Search,
    when: ({ currentPage }) => currentPage.type === "thread",
    run: ({ openNextThreadSearchDialog }) => openNextThreadSearchDialog(),
  },
  {
    id: "page.toggle-filter",
    label: "フィルターを切り替え",
    englishLabel: "Toggle Filter",
    keywords: ["検索", "絞り込み", "filter"],
    group: "page",
    icon: Filter,
    when: ({ currentPage }) => FILTERABLE_PAGE_TYPES.has(currentPage.type),
    run: toggleFilter,
  },
  {
    id: "page.toggle-write-panel",
    label: ({ isWritePanelOpen }) =>
      isWritePanelOpen ? "書き込みパネルを閉じる" : "書き込みパネルを開く",
    englishLabel: ({ isWritePanelOpen }) =>
      isWritePanelOpen ? "Close Write Panel" : "Open Write Panel",
    keywords: ["投稿", "write", "レス"],
    group: "page",
    icon: PenLine,
    when: ({ currentPage }) => currentPage.type === "thread",
    run: ({ toggleWritePanel }) => toggleWritePanel(),
  },
  {
    id: "page.toggle-bookmark",
    label: "現在のページのブックマークを切り替え",
    englishLabel: "Toggle Bookmark for Current Page",
    keywords: ["お気に入り", "star", "bookmark"],
    group: "page",
    icon: Star,
    when: ({ currentPage }) => getCommandPageTarget(currentPage) != null,
    run: toggleBookmark,
  },
  {
    id: "page.open-board",
    label: "このスレッドの板を新しいタブで開く",
    englishLabel: "Open This Thread's Board in New Tab",
    keywords: ["板に移動", "board", "掲示板"],
    group: "page",
    icon: List,
    when: ({ currentPage }) => getBoardPageFromThread(currentPage) != null,
    run: ({ currentPage, dispatch }) => {
      const boardPage = getBoardPageFromThread(currentPage);
      if (!boardPage) return;
      dispatch({ type: "OPEN_IN_NEW_TAB", page: boardPage });
    },
  },
  {
    id: "page.open-external",
    label: "現在のページを外部ブラウザで開く",
    englishLabel: "Open Current Page in External Browser",
    keywords: ["browser", "web", "外部"],
    group: "page",
    icon: ExternalLink,
    when: ({ currentPage }) => getCommandPageTarget(currentPage) != null,
    run: ({ currentPage }) => {
      const target = getCommandPageTarget(currentPage);
      if (!target) return;
      window.open(target.url, "_blank", "noopener,noreferrer");
    },
  },
  {
    id: "layout.toggle-pane",
    label: ({ isTwoPane }) => (isTwoPane ? "2ペイン表示を解除" : "2ペインで表示"),
    englishLabel: ({ isTwoPane }) => (isTwoPane ? "Close Two-Pane View" : "Show in Two Panes"),
    keywords: ["分割", "split", "pane", "レイアウト"],
    group: "layout",
    icon: Columns2,
    run: ({ dispatch, isTwoPane }) => dispatch({ type: isTwoPane ? "CLOSE_PANE" : "SPLIT_PANE" }),
  },
  {
    id: "copy.page-title",
    label: "現在のページタイトルをコピー",
    englishLabel: "Copy Current Page Title",
    keywords: ["スレタイ", "板名", "title"],
    group: "copy",
    icon: Clipboard,
    when: ({ currentPage }) => getCommandPageTarget(currentPage) != null,
    run: async ({ currentPage }) => {
      const target = getCommandPageTarget(currentPage);
      if (!target) return;
      await copyWithNotice(target.title, "ページタイトル");
    },
  },
  {
    id: "copy.page-url",
    label: "現在のページURLをコピー",
    englishLabel: "Copy Current Page URL",
    keywords: ["アドレス", "link", "URL"],
    group: "copy",
    icon: Clipboard,
    when: ({ currentPage }) => getCommandPageTarget(currentPage) != null,
    run: async ({ currentPage }) => {
      const target = getCommandPageTarget(currentPage);
      if (!target) return;
      await copyWithNotice(target.url, "ページURL");
    },
  },
  {
    id: "copy.page-title-url",
    label: "ページタイトルとURLをコピー",
    englishLabel: "Copy Page Title and URL",
    keywords: ["スレタイ&URL", "title link"],
    group: "copy",
    icon: Clipboard,
    when: ({ currentPage }) => getCommandPageTarget(currentPage) != null,
    run: async ({ currentPage }) => {
      const target = getCommandPageTarget(currentPage);
      if (!target) return;
      await copyWithNotice(`${target.title}\n${target.url}`, "タイトルとURL");
    },
  },
  {
    id: "copy.page-title-url-markdown",
    label: "スレタイとURLをMarkdownでコピー",
    englishLabel: "Copy Thread Title and URL as Markdown",
    description: "スレタイとURLをMarkdownリンク形式でコピーします",
    keywords: ["スレタイ&URL", "Markdown", "マークダウン", "title link"],
    group: "copy",
    icon: Clipboard,
    // 変更理由: 板一覧にはスレタイがないため、スレッドのタイトルと正規URLを組み合わせる操作に限定する。
    when: ({ currentPage }) => currentPage.type === "thread",
    run: async ({ currentPage }) => {
      const target = getCommandPageTarget(currentPage);
      if (!target) return;
      // 変更理由: 改行形式の既存コマンドを残し、Markdownを必要とする貼り付け先だけ選べるようにする。
      await copyWithNotice(formatMarkdownLink(target.title, target.url), "Markdownリンク");
    },
  },
  {
    id: "copy.subject-url",
    label: "subject.txtのURLをコピー",
    englishLabel: "Copy subject.txt URL",
    description: "現在の板のスレッド一覧取得URLをコピーします",
    keywords: ["subject", "raw", "板一覧", "生URL"],
    group: "copy",
    icon: Clipboard,
    when: ({ currentPage }) => getSubjectUrlForCommand(currentPage) != null,
    run: async ({ currentPage }) => {
      const subjectUrl = getSubjectUrlForCommand(currentPage);
      if (!subjectUrl) return;
      await copyWithNotice(subjectUrl, "subject.txtのURL");
    },
  },
  {
    id: "copy.dat-url",
    label: "datのURLをコピー",
    englishLabel: "Copy dat URL",
    description: "現在のスレッドのdat取得URLをコピーします",
    keywords: ["dat", "raw", "過去ログ", "生URL"],
    group: "copy",
    icon: Clipboard,
    when: ({ currentPage }) => getDatUrlForCommand(currentPage) != null,
    run: async ({ currentPage }) => {
      const datUrl = getDatUrlForCommand(currentPage);
      if (!datUrl) return;
      await copyWithNotice(datUrl, "datのURL");
    },
  },
  {
    id: "copy.thread-toon",
    label: "スレ全体をTOON形式でコピー",
    englishLabel: "Copy Entire Thread as TOON",
    description: "LLM向けのTOON形式で全レスをコピーし、推定トークン数を表示します",
    keywords: ["TOON", "AI", "LLM", "全レス", "スレッド全体"],
    group: "copy",
    icon: Clipboard,
    when: ({ currentPage }) => currentPage.type === "thread",
    run: async ({ currentPage }) => {
      if (currentPage.type !== "thread") return;

      const thread = await container.thread.getThread(currentPage.threadUrl);
      if (thread.res.length === 0) {
        throw new Error(thread.message || "コピーできるレスがありません");
      }

      const toon = encodeThreadAsToon({
        title: thread.title || currentPage.title,
        url: thread.url || currentPage.threadUrl,
        res: thread.res,
      });
      const tokenCount = estimateToonTokenCount(toon);

      await copyText(toon);
      container.toast.success(
        `スレ全体をTOON形式でコピーしました（推定 ${tokenCount.toLocaleString("ja-JP")} トークン）`,
      );
    },
  },
];

export function resolveBrowserCommands(
  context: BrowserCommandContext,
  runningCommandIds: ReadonlySet<string> = new Set(),
): ResolvedBrowserCommand[] {
  return BROWSER_COMMAND_DEFINITIONS.filter((definition) => definition.when?.(context) ?? true).map(
    (definition) => ({
      id: definition.id,
      label: getCommandLabel(definition.label, context),
      englishLabel: getCommandLabel(definition.englishLabel, context),
      description: definition.description,
      keywords: definition.keywords ?? [],
      group: definition.group,
      icon: definition.icon,
      enabled: !runningCommandIds.has(definition.id) && (definition.isEnabled?.(context) ?? true),
    }),
  );
}

export async function executeBrowserCommand(
  commandId: string,
  context: BrowserCommandContext,
): Promise<boolean> {
  const definition = BROWSER_COMMAND_DEFINITIONS.find((command) => command.id === commandId);
  if (!definition) return false;

  // 変更理由: パレットを開いたままページ状態が変わる可能性があるため、
  // 表示時の判定を信用せず実行直前にも可否を確認する。
  if (!(definition.when?.(context) ?? true)) return false;
  if (!(definition.isEnabled?.(context) ?? true)) return false;

  await definition.run(context);
  return true;
}

export function getBrowserCommandLabel(commandId: string, context: BrowserCommandContext): string {
  const definition = BROWSER_COMMAND_DEFINITIONS.find((command) => command.id === commandId);
  return definition ? getCommandLabel(definition.label, context) : commandId;
}
