// ページ種別の定義
// ナビゲーション階層: ホーム → 板一覧 → スレッド一覧 → スレッド
export type PageType = "home" | "boardList" | "threadList" | "thread";

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

export type Page = HomePage | BoardListPage | ThreadListPage | ThreadPage;

export interface Tab {
  id: string;
  history: Page[];
  currentIndex: number;
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
    case "threadList":
      return (page as ThreadListPage).boardUrl;
    case "thread":
      return (page as ThreadPage).threadUrl;
  }
}
