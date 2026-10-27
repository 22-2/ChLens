import {
  Bookmark,
  File,
  History,
  House,
  LayoutList,
  ListTree,
  type LucideProps,
  MessageSquareText,
  PenLine,
  ScrollText,
  Settings,
} from "lucide-react";
import type { ComponentType } from "react";
import type { Page, PageType } from "src/view/browser/types";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";
import { normalizePageLocation } from "src/view/browser/utils/page-location";

type PageDisplayUrl =
  | { kind: "literal"; value: string }
  | { kind: "board-url" }
  | { kind: "thread-url" };

export interface PageTypeDefinition {
  icon: ComponentType<LucideProps>;
  refreshable: boolean;
  filterable: boolean;
  autoRefreshable: boolean;
  identity: "page-type" | "view-state";
  viewStateKey: "page-type" | "board-url" | "thread-url";
  displayUrl: PageDisplayUrl;
  hierarchy: "home-only" | "home-and-page" | "thread-board";
  renderKey: "page-type" | "board-url" | "thread-url";
}

/**
 * ページ種別ごとの共通メタデータ。
 * 変更理由: アイコンや更新・絞り込み可否、同一ページの扱いが複数の判定へ散らばると、
 * 新しい種別を追加したときに画面ごとの差が出るため、同じ定義から参照する。
 * 垂直タブバーではタイトルが隠れるためアイコンを必須にし、旧セッションの newTab も描画する。
 * 板ツリーを削除しても板を探す目印を保つため、ListTree は板一覧へ引き継ぐ。
 */
export const PAGE_TYPE_DEFINITIONS = {
  home: {
    icon: House,
    refreshable: false,
    filterable: false,
    autoRefreshable: false,
    identity: "page-type",
    viewStateKey: "page-type",
    displayUrl: { kind: "literal", value: "" },
    hierarchy: "home-only",
    renderKey: "page-type",
  },
  newTab: {
    icon: File,
    refreshable: false,
    filterable: false,
    autoRefreshable: false,
    identity: "page-type",
    viewStateKey: "page-type",
    displayUrl: { kind: "literal", value: "" },
    hierarchy: "home-only",
    renderKey: "page-type",
  },
  boardList: {
    icon: ListTree,
    refreshable: true,
    filterable: true,
    autoRefreshable: false,
    identity: "page-type",
    viewStateKey: "page-type",
    displayUrl: { kind: "literal", value: "板一覧" },
    hierarchy: "home-and-page",
    renderKey: "page-type",
  },
  threadList: {
    icon: LayoutList,
    refreshable: true,
    filterable: true,
    autoRefreshable: true,
    identity: "view-state",
    viewStateKey: "board-url",
    displayUrl: { kind: "board-url" },
    hierarchy: "home-and-page",
    renderKey: "board-url",
  },
  thread: {
    icon: MessageSquareText,
    refreshable: true,
    filterable: true,
    autoRefreshable: true,
    identity: "view-state",
    viewStateKey: "thread-url",
    displayUrl: { kind: "thread-url" },
    hierarchy: "thread-board",
    renderKey: "thread-url",
  },
  settings: {
    icon: Settings,
    refreshable: false,
    filterable: false,
    autoRefreshable: false,
    identity: "page-type",
    viewStateKey: "page-type",
    displayUrl: { kind: "literal", value: "設定" },
    hierarchy: "home-and-page",
    renderKey: "page-type",
  },
  bookmarkList: {
    icon: Bookmark,
    refreshable: false,
    filterable: true,
    autoRefreshable: false,
    identity: "page-type",
    viewStateKey: "page-type",
    displayUrl: { kind: "literal", value: "ブックマーク" },
    hierarchy: "home-and-page",
    renderKey: "page-type",
  },
  historyList: {
    icon: History,
    refreshable: true,
    filterable: true,
    autoRefreshable: false,
    identity: "page-type",
    viewStateKey: "page-type",
    displayUrl: { kind: "literal", value: "閲覧履歴" },
    hierarchy: "home-and-page",
    renderKey: "page-type",
  },
  writeHistoryList: {
    icon: PenLine,
    refreshable: true,
    filterable: true,
    autoRefreshable: false,
    identity: "page-type",
    viewStateKey: "page-type",
    displayUrl: { kind: "literal", value: "書き込み履歴" },
    hierarchy: "home-and-page",
    renderKey: "page-type",
  },
  logList: {
    icon: ScrollText,
    refreshable: true,
    filterable: true,
    autoRefreshable: false,
    identity: "page-type",
    viewStateKey: "page-type",
    displayUrl: { kind: "literal", value: "ログ検索" },
    hierarchy: "home-and-page",
    renderKey: "page-type",
  },
} as const satisfies Record<PageType, PageTypeDefinition>;

function getPageLocation(page: Page, strategy: PageTypeDefinition["viewStateKey"]): string | null {
  if (strategy === "board-url" && page.type === "threadList") {
    return page.boardUrl;
  }
  if (strategy === "thread-url" && page.type === "thread") {
    return page.threadUrl;
  }
  return null;
}

export function getPageViewStateKey(page: Page): string {
  const strategy = PAGE_TYPE_DEFINITIONS[page.type].viewStateKey;
  const location = getPageLocation(page, strategy);
  if (location == null) return page.type;
  return page.type + ":" + normalizePageLocation(location);
}

export function getPageIdentity(page: Page): string {
  // クイックアクセスは種別ごとに区別し、スレ系は正規化したURLを含む状態キーで区別する。
  return PAGE_TYPE_DEFINITIONS[page.type].identity === "view-state"
    ? getPageViewStateKey(page)
    : page.type;
}

export function getDisplayUrl(page: Page): string {
  const displayUrl = PAGE_TYPE_DEFINITIONS[page.type].displayUrl;
  if (displayUrl.kind === "literal") return displayUrl.value;
  const location = getPageLocation(
    page,
    displayUrl.kind === "board-url" ? "board-url" : "thread-url",
  );
  return location ?? "";
}

export function buildHierarchy(page: Page): Page[] {
  const homePage: Page = { type: "home", title: "ホーム" };
  const hierarchy = PAGE_TYPE_DEFINITIONS[page.type].hierarchy;
  if (hierarchy === "home-only") return [homePage];
  if (hierarchy === "home-and-page") return [homePage, page];

  // 新規タブ用の履歴は板一覧を祖先に含め、スレッドから同じ板へ戻れるようにする。
  if (page.type !== "thread") {
    throw new Error("スレッド以外に thread-board 階層が設定されています: " + page.type);
  }
  const boardUrl = getBoardUrlFromThreadUrl(page.threadUrl);
  return [
    homePage,
    {
      type: "threadList",
      title: boardUrl,
      boardUrl,
      boardTitle: boardUrl,
    },
    page,
  ];
}

export function getPageRenderKey(tabId: string, historyIndex: number, page: Page): string {
  const strategy = PAGE_TYPE_DEFINITIONS[page.type].renderKey;
  const location = getPageLocation(page, strategy);
  const pageKey = location == null ? page.type : page.type + ":" + location;
  return tabId + ":" + historyIndex + ":" + pageKey;
}
