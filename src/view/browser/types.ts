// ページ種別の定義
// ナビゲーション階層: ホーム → 板一覧 → スレッド一覧 → スレッド
export type PageType =
  | "home"
  | "boardList"
  | "threadList"
  | "thread"
  | "settings";

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
}

export type Page =
  | HomePage
  | BoardListPage
  | ThreadListPage
  | ThreadPage
  | SettingsPage;

export interface Tab {
  id: string;
  history: Page[];
  currentIndex: number;
  pinned: boolean;
  // ページの強制再読み込みに使うカウンター。インクリメントするとContentAreaがページを再マウントする
  reloadKey: number;
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
    case "threadList":
      return (page as ThreadListPage).boardUrl;
    case "thread":
      return (page as ThreadPage).threadUrl;
  }
}

// スレッドURLから板URLを導出する
// /test/read.cgi/board_name/thread_id/ → /board_name/
function threadUrlToBoardUrl(threadUrl: string): string {
  try {
    const url = new window.URL(threadUrl);
    // 5ch, bbspink, eddibb: /test/read.cgi/BOARD/THREAD_ID/
    const chMatch = url.pathname.match(/^\/test\/read\.cgi\/([^/]+)\//);
    if (chMatch) {
      return `${url.origin}/${chMatch[1]}/`;
    }
    // したらば: /bbs/read.cgi/CATEGORY/BOARD/THREAD_ID/
    const jbbsMatch = url.pathname.match(/^\/bbs\/read\.cgi\/([^/]+\/[^/]+)\//);
    if (jbbsMatch) {
      return `${url.origin}/bbs/read.cgi/${jbbsMatch[1]}/`;
    }
    // まちBBS: /bbs/read.cgi/BOARD/THREAD_ID/
    const machiMatch = url.pathname.match(/^\/bbs\/read\.cgi\/([^/]+)\//);
    if (machiMatch) {
      return `${url.origin}/${machiMatch[1]}/`;
    }
  } catch {
    // パース不能時はそのまま返す
  }
  return threadUrl;
}

// ナビゲーション先のページに対して、必ず正しい階層スタックを構築する
// ホーム → 板一覧 → スレッド一覧 → スレッド
export function buildHierarchy(page: Page): Page[] {
  switch (page.type) {
    case "home":
      return [page];

    case "boardList":
      return [{ type: "home", title: "ホーム" }, page];

    case "settings":
      return [{ type: "home", title: "ホーム" }, page];

    case "threadList":
      return [
        { type: "home", title: "ホーム" },
        { type: "boardList", title: "板一覧" },
        page,
      ];

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
