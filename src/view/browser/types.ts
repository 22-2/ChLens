import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";

// ページ種別の定義
// ナビゲーション階層: ホーム → 板一覧 → スレッド一覧 → スレッド
export type PageType =
  | "home"
  | "boardList"
  | "threadList"
  | "thread"
  | "settings"
  | "bookmarkList"
  | "historyList"
  | "writeHistoryList"
  | "logList";

// スレッドの絞り込みはタブのviewStatesへ保存されるため、
// スレッド画面だけでなくタブ状態モデルからも参照できる共通型としてここに置く。
export type ThreadFilter = "all" | "popular" | "image" | "video" | "link";

// 変更理由: 検索対象も検索語と同じスレッド単位で復元し、タブを切り替えても
// ユーザーが選んだ本文・名前・IDの検索条件を失わないようにする。
export type ThreadSearchTarget = "all" | "body" | "name" | "id";

export interface HomePage {
  type: "home";
  title: string;
}

export interface BoardListPage {
  type: "boardList";
  title: string;
}

export interface ThreadListPage {
  type: "threadList";
  title: string;
  boardUrl: string;
  boardTitle: string;
}

export interface ThreadPage {
  type: "thread";
  title: string;
  threadUrl: string;
}

export interface SettingsPage {
  type: "settings";
  title: string;
  sectionId?: string;
}

export interface BookmarkListPage {
  type: "bookmarkList";
  title: string;
}

export interface HistoryListPage {
  type: "historyList";
  title: string;
}

export interface WriteHistoryListPage {
  type: "writeHistoryList";
  title: string;
}

export interface LogListPage {
  type: "logList";
  title: string;
}

export type Page =
  | HomePage
  | BoardListPage
  | ThreadListPage
  | ThreadPage
  | SettingsPage
  | BookmarkListPage
  | HistoryListPage
  | WriteHistoryListPage
  | LogListPage;

export interface TabViewState {
  searchQuery?: string;
  filter?: ThreadFilter;
  searchTarget?: ThreadSearchTarget;
  sortColumn?: string | null;
  sortDirection?: "asc" | "desc";
  searchMode?: "title" | "body";
}

export type TabViewStates = Record<string, TabViewState>;

export interface Tab {
  id: string;
  history: Page[];
  currentIndex: number;
  pinned: boolean;
  // ページの強制再読み込みに使うカウンター。インクリメントするとContentAreaがページを再マウントする
  reloadKey: number;
  // 自動更新は現在ページだけに結び付け、別ページへ移動した時点で解除する。
  // スレ/スレ一覧を同じロジックで扱うため、URLそのものではなくページ識別キーを保持する。
  autoRefreshEnabled: boolean;
  autoRefreshPageKey: string | null;
  // ページごとの検索・絞り込み・並び順をタブに保持する。
  // URLをキーに含めることで、同じタブ内で板やスレを移動しても状態が混ざらない。
  viewStates?: TabViewStates;
}

// 横分割の1カラム。各ペインが独立したタブ群とアクティブタブを持つ。
// 配列順がそのまま画面上の横並び順になる。
export interface Pane {
  id: string;
  tabs: Tab[];
  activeTabId: string;
}

// --- Core API の型定義 ---
// app_core.js から提供されるモジュールの型

export interface BBSBoard {
  title: string;
  url: string;
}

export interface BBSCategory {
  title: string;
  board: BBSBoard[];
}

export interface BBSMenuResult {
  status: string;
  menu?: BBSCategory[];
  message?: string;
}

export interface ThreadListItem {
  title: string;
  url: string;
  resCount: number;
  ng?: unknown;
  highlight?: unknown;
  isNet?: boolean;
  readState?: unknown;
  threadNumber?: string;
}

export interface BoardResult {
  threads: ThreadListItem[];
  message?: string;
}

export interface ThreadRes {
  num: number;
  name: string;
  mail: string;
  message: string;
  other: string;
  id?: string;
  trip?: string;
  slip?: string;
  be?: string;
  date?: string;
  ng?: unknown;
}

export interface ThreadDetail {
  url: string;
  title: string;
  res: ThreadRes[];
  expired: boolean;
  message?: string;
}

// --- ユーティリティ関数 ---

export function getCurrentPage(tab: Tab): Page {
  return tab.history[tab.currentIndex];
}

function normalizeViewStateLocation(rawLocation: string): string {
  try {
    const parsed = new URL(rawLocation);
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "/");
  } catch {
    return rawLocation.trim().replace(/\/+$/, "");
  }
}

export function getPageViewStateKey(page: Page): string {
  switch (page.type) {
    case "threadList":
      return `threadList:${normalizeViewStateLocation(page.boardUrl)}`;
    case "thread":
      return `thread:${normalizeViewStateLocation(page.threadUrl)}`;
    default:
      return page.type;
  }
}

export function canGoBack(tab: Tab): boolean {
  return tab.currentIndex > 0;
}

export function canGoForward(tab: Tab): boolean {
  return tab.currentIndex < tab.history.length - 1;
}

export function getDisplayUrl(page: Page): string {
  switch (page.type) {
    case "home":
      return "";
    case "boardList":
      return "板一覧";
    case "settings":
      return "設定";
    case "bookmarkList":
      return "ブックマーク";
    case "historyList":
      return "閲覧履歴";
    case "writeHistoryList":
      return "書き込み履歴";
    case "logList":
      return "ログ検索";
    case "threadList":
      return (page as ThreadListPage).boardUrl;
    case "thread":
      return (page as ThreadPage).threadUrl;
  }
}

// スレッドURLから板URLを導出する
// /test/read.cgi/board_name/thread_id/ → /board_name/
function threadUrlToBoardUrl(threadUrl: string): string {
  return getBoardUrlFromThreadUrl(threadUrl);
}

// 新規タブ用: ページに対してカノニカルな階層スタックを構築する
// ホーム → 板一覧 → スレッド一覧 → スレッド
export function buildHierarchy(page: Page): Page[] {
  switch (page.type) {
    case "home":
      return [page];

    case "boardList":
      return [{ type: "home", title: "ホーム" }, page];

    case "settings":
      return [{ type: "home", title: "ホーム" }, page];

    case "bookmarkList":
      return [{ type: "home", title: "ホーム" }, page];

    case "historyList":
      return [{ type: "home", title: "ホーム" }, page];

    case "writeHistoryList":
      return [{ type: "home", title: "ホーム" }, page];

    case "logList":
      return [{ type: "home", title: "ホーム" }, page];

    case "threadList":
      return [{ type: "home", title: "ホーム" }, { type: "boardList", title: "板一覧" }, page];

    case "thread": {
      const boardUrl = threadUrlToBoardUrl(page.threadUrl);
      return [
        { type: "home", title: "ホーム" },
        { type: "boardList", title: "板一覧" },
        {
          type: "threadList",
          title: boardUrl,
          boardUrl,
          boardTitle: boardUrl,
        },
        page,
      ];
    }
  }
}
