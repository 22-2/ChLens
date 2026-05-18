import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import { add as addHistoryRecord, remove as removeHistoryRecord } from "src/core/History";
import { platform } from "src/app/platform";
import browser from "webextension-polyfill";
import {
  getStore2String,
  setStore2String,
} from "src/app/Store2Storage";
import {
  buildHierarchy,
  getCurrentPage,
  type Page,
  type Tab,
} from "src/view/browser/types";
import {
  getAutoRefreshPageKey,
  resetAutoRefreshState,
} from "src/view/browser/utils/auto-refresh-pages";
import {
  getBoardUrlFromThreadUrl,
  parseInternalBrowserPage,
} from "src/view/browser/utils/link-routing";

export interface TabStoreState {
  tabs: Tab[];
  activeTabId: string;
  closedTabs: Tab[];
}

export type TabAction =
  | { type: "ADD_TAB" }
  | { type: "OPEN_IN_NEW_TAB"; page: Page }
  | { type: "OPEN_IN_NEW_TAB_FORCE"; page: Page }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "CLOSE_OTHER_TABS"; tabId: string }
  | { type: "CLOSE_RIGHT_TABS"; tabId: string }
  | { type: "CLOSE_ALL_TABS" }
  | { type: "REOPEN_CLOSED_TAB" }
  | { type: "TOGGLE_PIN"; tabId: string }
  | { type: "MOVE_TAB"; dragTabId: string; targetTabId: string }
  | { type: "SELECT_TAB"; tabId: string }
  | { type: "NAVIGATE"; page: Page }
  | { type: "NAVIGATE_TAB"; tabId: string; page: Page }
  | { type: "GO_BACK" }
  | { type: "GO_FORWARD" }
  | { type: "GO_TO_HISTORY_INDEX"; index: number }
  | { type: "UPDATE_TITLE"; title: string }
  | { type: "UPDATE_TITLE_FOR_TAB"; tabId: string; title: string }
  | { type: "RELOAD" }
  | {
      type: "FOLLOW_NEXT_THREAD";
      page: Extract<Page, { type: "thread" }>;
      keepAutoRefresh?: boolean;
    }
  | {
      type: "SET_AUTO_REFRESH_ENABLED";
      enabled: boolean;
      pageKey?: string;
    }
  | { type: "RESTORE"; state: TabStoreState };

// 閉じたタブの最大保持数
const MAX_CLOSED_TABS = 20;
const SESSION_KEY = "chlens_browser_session";
const CONFIG_KEY_PREFIX = "config_";

type NewTabPageMode = "home" | "related_board" | "custom_board";

function readConfigValue(key: string): string | null {
  try {
    return getStore2String(`${CONFIG_KEY_PREFIX}${key}`);
  } catch {
    return null;
  }
}

function resolveNewTabPageMode(raw: string | null): NewTabPageMode {
  if (raw === "home" || raw === "custom_board") {
    return raw;
  }

  // 未設定時は「関連する板」を既定にして、スレ閲覧中の導線を短縮する。
  return "related_board";
}

function normalizePageLocation(rawLocation: string): string {
  try {
    const parsed = new window.URL(rawLocation);
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "/");
  } catch {
    return rawLocation.trim().replace(/\/+$/, "");
  }
}

interface ThreadHistoryVisit {
  tabId: string;
  threadUrl: string;
  title: string;
  boardTitle: string;
  date: number;
  pending: Promise<void>;
}

function isHistoryDisabled(): boolean {
  return readConfigValue("no_history") === "on";
}

function deriveHistoryBoardTitle(threadUrl: string): string {
  try {
    const parsed = new window.URL(threadUrl);
    const match = parsed.pathname.match(
      /^(?:\/[\w-]+)?\/test\/read\.cgi\/([\w-]+)\/\d+\/?/,
    );
    return decodeURIComponent(match?.[1] ?? "");
  } catch {
    return "";
  }
}

function getThreadVisitKey(tabId: string, threadUrl: string): string {
  return `${tabId}:${threadUrl}`;
}

function reportHistoryPersistenceError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${context}: ${message}`, error);

  const appMessage = (
    window as Window &
      typeof globalThis & {
        app?: {
          message?: {
            send?: (type: string, payload?: unknown) => void;
          };
        };
      }
  ).app?.message;

  appMessage?.send?.("notify", {
    message: `${context}: ${message}`,
    background_color: "red",
  });
}

function clearThreadVisitsForTab(
  visitStore: Map<string, ThreadHistoryVisit>,
  tabId: string,
): void {
  for (const key of visitStore.keys()) {
    if (key.startsWith(`${tabId}:`)) {
      visitStore.delete(key);
    }
  }
}

function getPageIdentity(page: Page): string {
  switch (page.type) {
    case "home":
      return "home";
    case "boardList":
      return "boardList";
    case "settings":
      return "settings";
    // クイックアクセス3種を別IDとして扱い、
    // 「既に開いている判定」で相互に潰し合って遷移不能になる回帰を防ぐ。
    case "bookmarkList":
      return "bookmarkList";
    case "historyList":
      return "historyList";
    case "writeHistoryList":
      return "writeHistoryList";
    case "threadList":
      return getAutoRefreshPageKey(page) ?? "threadList";
    case "thread":
      return getAutoRefreshPageKey(page) ?? "thread";
  }

  throw new Error("Unsupported page type");
}

function createThreadListPageFromBoardUrl(
  boardUrl: string,
): Extract<Page, { type: "threadList" }> {
  const normalized = normalizePageLocation(boardUrl);
  return {
    type: "threadList",
    title: normalized,
    boardUrl: normalized,
    boardTitle: normalized,
  };
}

function resolveRelatedBoardPage(
  sourcePage: Page | null,
): Extract<Page, { type: "threadList" }> | null {
  if (!sourcePage) {
    return null;
  }

  if (sourcePage.type === "threadList") {
    return {
      ...sourcePage,
      boardUrl: normalizePageLocation(sourcePage.boardUrl),
      boardTitle:
        sourcePage.boardTitle || normalizePageLocation(sourcePage.boardUrl),
      title:
        sourcePage.title ||
        sourcePage.boardTitle ||
        normalizePageLocation(sourcePage.boardUrl),
    };
  }

  if (sourcePage.type === "thread") {
    const boardUrl = deriveBoardUrlFromThreadUrl(sourcePage.threadUrl);
    if (!boardUrl) {
      return null;
    }

    return createThreadListPageFromBoardUrl(boardUrl);
  }

  return null;
}

function resolveRelatedBoardPageFromTabHistory(
  sourceTab: Tab | null,
): Extract<Page, { type: "threadList" }> | null {
  if (!sourceTab) {
    return null;
  }

  const currentPage = getCurrentPage(sourceTab);
  if (currentPage.type !== "thread") {
    return null;
  }

  const targetBoardUrl = deriveBoardUrlFromThreadUrl(currentPage.threadUrl);
  if (!targetBoardUrl) {
    return null;
  }

  const normalizedTargetBoardUrl = normalizePageLocation(targetBoardUrl);

  for (let index = sourceTab.currentIndex - 1; index >= 0; index -= 1) {
    const candidate = sourceTab.history[index];
    if (candidate.type !== "threadList") {
      continue;
    }

    if (
      normalizePageLocation(candidate.boardUrl) !== normalizedTargetBoardUrl
    ) {
      continue;
    }

    return {
      ...candidate,
      boardUrl: normalizedTargetBoardUrl,
      boardTitle:
        candidate.boardTitle || candidate.title || normalizedTargetBoardUrl,
      title:
        candidate.title || candidate.boardTitle || normalizedTargetBoardUrl,
    };
  }

  return null;
}

function resolveConfiguredNewTabPage(
  sourcePage: Page | null,
  sourceTab: Tab | null = null,
): Page {
  const mode = resolveNewTabPageMode(readConfigValue("new_tab_page_mode"));

  if (mode === "home") {
    return { type: "home", title: "ホーム" };
  }

  if (mode === "custom_board") {
    const rawBoardUrl = readConfigValue("new_tab_page_board_url");
    if (typeof rawBoardUrl === "string" && rawBoardUrl.trim() !== "") {
      return createThreadListPageFromBoardUrl(rawBoardUrl);
    }

    return { type: "home", title: "ホーム" };
  }

  // 変更理由: 「関連する板」タブをスレッドから開くとき、
  // 直前の threadList 履歴にある確定板名を再利用して URL 仮タイトルの残留を防ぐ。
  const relatedBoardPage =
    resolveRelatedBoardPageFromTabHistory(sourceTab) ??
    resolveRelatedBoardPage(sourcePage);
  if (relatedBoardPage) {
    return relatedBoardPage;
  }

  return { type: "home", title: "ホーム" };
}

function findTabByCurrentPage(
  tabs: Tab[],
  page: Page,
  excludeTabId?: string,
): Tab | null {
  const targetIdentity = getPageIdentity(page);
  return (
    tabs.find(
      (tab) =>
        tab.id !== excludeTabId &&
        getPageIdentity(getCurrentPage(tab)) === targetIdentity,
    ) ?? null
  );
}

function createTab(
  sourcePage: Page | null = null,
  sourceTab: Tab | null = null,
): Tab {
  const initialPage = resolveConfiguredNewTabPage(sourcePage, sourceTab);
  return {
    id: crypto.randomUUID(),
    history: buildHierarchy(initialPage),
    currentIndex: buildHierarchy(initialPage).length - 1,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  };
}

function createTabFromPage(page: Page): Tab {
  const history = buildHierarchy(page);
  return {
    id: crypto.randomUUID(),
    history,
    currentIndex: history.length - 1,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  };
}

function readInitialPageFromLocation(): Page | null {
  try {
    const query = new window.URL(window.location.href).searchParams.get("q");
    if (typeof query !== "string" || query.trim() === "") {
      return null;
    }

    return parseInternalBrowserPage(query);
  } catch {
    return null;
  }
}

function sanitizeSessionState(state: TabStoreState): TabStoreState {
  return {
    ...state,
    // 変更理由: 自動更新は実行時状態として扱い、タブ復元/複製で意図せず再開しないよう永続化しない。
    tabs: state.tabs.map((tab) => resetAutoRefreshState(tab)),
    closedTabs: state.closedTabs.map((tab) => resetAutoRefreshState(tab)),
  };
}

// セッション復元: localStorageから前回の状態を読み込む
function loadSession(): TabStoreState | null {
  try {
    const raw = getStore2String(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TabStoreState;
    if (parsed.tabs?.length > 0 && parsed.activeTabId) {
      const normalizeLoadedTab = (tab: Tab): Tab => {
        const normalized = {
          ...tab,
          pinned: tab.pinned ?? false,
          reloadKey: tab.reloadKey ?? 0,
        };
        // 変更理由: 旧セッションに自動更新状態が残っていても復元時は常にOFFへ正規化する。
        return resetAutoRefreshState(normalized);
      };

      return {
        ...parsed,
        tabs: parsed.tabs.map((tab) => normalizeLoadedTab(tab)),
        closedTabs: (parsed.closedTabs ?? []).map((tab) =>
          normalizeLoadedTab(tab),
        ),
      };
    }
  } catch {
    // パース失敗時は無視
  }
  return null;
}

function saveSession(state: TabStoreState): void {
  try {
    setStore2String(SESSION_KEY, JSON.stringify(sanitizeSessionState(state)));
  } catch {
    // 容量超過等は無視
  }
}

const initialPageFromLocation = readInitialPageFromLocation();
const restoredSession = initialPageFromLocation ? null : loadSession();
const initialState: TabStoreState =
  restoredSession ??
  (initialPageFromLocation
    ? (() => {
        const tab = createTabFromPage(initialPageFromLocation);
        return {
          tabs: [tab],
          activeTabId: tab.id,
          closedTabs: [],
        };
      })()
    : {
        tabs: [createTab()],
        activeTabId: "",
        closedTabs: [],
      });
// 新規作成時にactiveTabIdを設定
if (!restoredSession && !initialPageFromLocation) {
  initialState.activeTabId = initialState.tabs[0].id;
}

function getActiveTab(state: TabStoreState): Tab {
  return state.tabs.find((t) => t.id === state.activeTabId)!;
}

function updateActiveTab(
  state: TabStoreState,
  updater: (tab: Tab) => Tab,
): TabStoreState {
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === state.activeTabId ? updater(t) : t)),
  };
}

// 変更理由: 「履歴の書き換え（replace）」を廃止し、常に push 方式に統一する。
// 新しいページを開く際に「足りない親ページ」だけを算出して積むことで、
// どこから飛んできても「戻れば親がいる」chmate式の体験を実現しつつ、
// 直前の閲覧履歴（さっきまで見ていたページ）が消えない動作にする。
function getMissingAncestors(
  currentPage: Page,
  targetPage: Page,
): Page[] {
  if (targetPage.type === "thread") {
    // 変更理由: スレ -> スレ遷移では「直前に見ていたスレ」自体を戻る先として残したい。
    // ここで板一覧/板を差し込むと Back が前スレではなく板へ着地してしまう。
    if (currentPage.type === "thread") {
      return [];
    }

    // 直前が threadList（板）なら親は揃っているので補完不要
    if (currentPage.type === "threadList") {
      return [];
    }
    // それ以外は [板一覧, 板] を補完してスレに戻れる経路を保証する
    const targetBoardUrl = deriveBoardUrlFromThreadUrl(targetPage.threadUrl);
    const boardPage: Extract<Page, { type: "threadList" }> = {
      type: "threadList",
      title: targetBoardUrl ?? targetPage.threadUrl,
      boardUrl: targetBoardUrl ?? targetPage.threadUrl,
      boardTitle: targetBoardUrl ?? targetPage.threadUrl,
    };
    return [{ type: "boardList", title: "板一覧" }, boardPage];
  }

  if (targetPage.type === "threadList") {
    // 直前が boardList（板一覧）なら親は揃っているので補完不要
    if (currentPage.type === "boardList") {
      return [];
    }
    return [{ type: "boardList", title: "板一覧" }];
  }

  return [];
}

function pushPageToTabHistory(tab: Tab, page: Page): Tab {
  const currentPage = getCurrentPage(tab);
  if (getPageIdentity(currentPage) === getPageIdentity(page)) {
    return tab;
  }

  // 常に push: 現在位置以降の「進む」履歴を切り捨て、
  // 足りない祖先ページを補完してから新ページを追加する。
  // 履歴を丸ごと書き換えないことで「さっきまで見ていたページ」が戻るで復元できる。
  const historyUntilCurrent = tab.history.slice(0, tab.currentIndex + 1);
  const missingAncestors = getMissingAncestors(currentPage, page);
  const newHistory = [...historyUntilCurrent, ...missingAncestors, page];
  return {
    ...tab,
    history: newHistory,
    currentIndex: newHistory.length - 1,
  };
}

function deriveBoardUrlFromThreadUrl(threadUrl: string): string | null {
  // 変更理由: URL判定を link-routing に集約し、タブ生成時だけ null フォールバック契約を維持する。
  const boardUrl = getBoardUrlFromThreadUrl(threadUrl);
  if (boardUrl !== threadUrl) {
    return boardUrl;
  }

  try {
    const parsed = new window.URL(threadUrl);
    const match = parsed.pathname.match(
      /^(?:\/[\w-]+)?\/test\/read\.cgi\/([\w-]+)\/\d+\/?/,
    );
    if (!match) {
      return null;
    }

    // 変更理由: 互換ホスト判定外でも read.cgi 形式のURL直開きは存在するため、
    // 最低限 board セグメントだけ復元して canonical stack を壊さないようにする。
    return `${parsed.origin}/${match[1]}/`;
  } catch {
    return null;
  }
}

function buildCanonicalThreadListStack(
  threadListPage: Extract<Page, { type: "threadList" }>,
): Page[] {
  return [
    { type: "home", title: "ホーム" },
    { type: "boardList", title: "板一覧" },
    threadListPage,
  ];
}

function buildCanonicalThreadStack(
  threadPage: Extract<Page, { type: "thread" }>,
  sourceThreadListPage: Extract<Page, { type: "threadList" }> | null,
): Page[] {
  const targetBoardUrl = deriveBoardUrlFromThreadUrl(threadPage.threadUrl);
  const normalizedTargetBoardUrl = targetBoardUrl
    ? normalizePageLocation(targetBoardUrl)
    : null;

  const boardPageFromSource =
    sourceThreadListPage &&
    normalizedTargetBoardUrl &&
    normalizePageLocation(sourceThreadListPage.boardUrl) ===
      normalizedTargetBoardUrl
      ? sourceThreadListPage
      : null;

  const boardPage: Extract<Page, { type: "threadList" }> =
    boardPageFromSource ?? {
      type: "threadList",
      title: targetBoardUrl ?? threadPage.threadUrl,
      boardUrl: targetBoardUrl ?? threadPage.threadUrl,
      boardTitle: targetBoardUrl ?? threadPage.threadUrl,
    };

  // 変更理由: 板/スレ導線は「ホーム -> 板一覧 -> 板 -> スレ」を常に基本形に統一し、
  // URL直開き・オムニバー遷移・新規タブ遷移で戻る挙動が揺れないようにする。
  return [...buildCanonicalThreadListStack(boardPage), threadPage];
}

function buildHierarchyForNewTab(sourcePage: Page, targetPage: Page): Page[] {
  if (targetPage.type === "thread") {
    return buildCanonicalThreadStack(
      targetPage,
      sourcePage.type === "threadList" ? sourcePage : null,
    );
  }

  if (targetPage.type === "threadList") {
    return buildCanonicalThreadListStack(targetPage);
  }

  return buildHierarchy(targetPage);
}

// 閉じたタブを記録するヘルパー
function pushClosed(closedTabs: Tab[], tab: Tab): Tab[] {
  return [tab, ...closedTabs].slice(0, MAX_CLOSED_TABS);
}

function tabReducer(state: TabStoreState, action: TabAction): TabStoreState {
  switch (action.type) {
    case "ADD_TAB": {
      const activeTab = getActiveTab(state);
      const sourcePage = getCurrentPage(activeTab);
      const newTab = createTab(sourcePage, activeTab);
      // 固定タブの後ろに非固定タブを追加
      return {
        ...state,
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      };
    }

    case "OPEN_IN_NEW_TAB": {
      // 同じページを複製すると管理しづらいので、既存タブがあればそちらへ集約する。
      const existingTab = findTabByCurrentPage(state.tabs, action.page);
      if (existingTab) {
        return {
          ...state,
          activeTabId: existingTab.id,
        };
      }

      // バックグラウンドで新規タブを開く（アクティブタブを切り替えない）
      const newTab = createTab();
      const sourcePage = getCurrentPage(getActiveTab(state));
      const newHistory = buildHierarchyForNewTab(sourcePage, action.page);
      const navigatedTab = {
        ...newTab,
        history: newHistory,
        currentIndex: newHistory.length - 1,
      };
      return {
        ...state,
        tabs: [...state.tabs, navigatedTab],
        // activeTabId は変更しない
      };
    }

    case "OPEN_IN_NEW_TAB_FORCE": {
      // 中クリック要件では「常に新規タブ」を優先するため、重複チェックを行わない。
      const newTab = createTab();
      const sourcePage = getCurrentPage(getActiveTab(state));
      const newHistory = buildHierarchyForNewTab(sourcePage, action.page);
      const navigatedTab = {
        ...newTab,
        history: newHistory,
        currentIndex: newHistory.length - 1,
      };
      return {
        ...state,
        tabs: [...state.tabs, navigatedTab],
        // activeTabId は変更しない
      };
    }

    case "CLOSE_TAB": {
      const target = state.tabs.find((t) => t.id === action.tabId);
      // 固定タブは閉じられない
      if (!target || target.pinned) return state;
      if (state.tabs.length <= 1) return state;
      const closingIndex = state.tabs.indexOf(target);
      const remaining = state.tabs.filter((t) => t.id !== action.tabId);
      let newActiveId = state.activeTabId;
      if (action.tabId === state.activeTabId) {
        const newIndex = Math.min(closingIndex, remaining.length - 1);
        newActiveId = remaining[newIndex].id;
      }
      return {
        tabs: remaining,
        activeTabId: newActiveId,
        closedTabs: pushClosed(state.closedTabs, target),
      };
    }

    case "CLOSE_OTHER_TABS": {
      // 指定タブと固定タブ以外を閉じる
      const closed = state.tabs.filter(
        (t) => t.id !== action.tabId && !t.pinned,
      );
      const remaining = state.tabs.filter(
        (t) => t.id === action.tabId || t.pinned,
      );
      if (remaining.length === 0) return state;
      let newClosed = state.closedTabs;
      for (const t of closed) {
        newClosed = pushClosed(newClosed, t);
      }
      return {
        tabs: remaining,
        activeTabId: action.tabId,
        closedTabs: newClosed,
      };
    }

    case "CLOSE_RIGHT_TABS": {
      const idx = state.tabs.findIndex((t) => t.id === action.tabId);
      if (idx === -1) return state;
      const rightTabs = state.tabs.slice(idx + 1).filter((t) => !t.pinned);
      if (rightTabs.length === 0) return state;
      const rightIds = new Set(rightTabs.map((t) => t.id));
      const remaining = state.tabs.filter((t) => !rightIds.has(t.id));
      let newClosed = state.closedTabs;
      for (const t of rightTabs) {
        newClosed = pushClosed(newClosed, t);
      }
      let newActiveId = state.activeTabId;
      if (rightIds.has(state.activeTabId)) {
        newActiveId = action.tabId;
      }
      return {
        tabs: remaining,
        activeTabId: newActiveId,
        closedTabs: newClosed,
      };
    }

    case "CLOSE_ALL_TABS": {
      // 固定タブ以外をすべて閉じ、新しいタブを開く
      const pinned = state.tabs.filter((t) => t.pinned);
      const closed = state.tabs.filter((t) => !t.pinned);
      let newClosed = state.closedTabs;
      for (const t of closed) {
        newClosed = pushClosed(newClosed, t);
      }
      const activeTab = getActiveTab(state);
      const sourcePage = getCurrentPage(activeTab);
      const newTab = createTab(sourcePage, activeTab);
      return {
        tabs: [...pinned, newTab],
        activeTabId: newTab.id,
        closedTabs: newClosed,
      };
    }

    case "REOPEN_CLOSED_TAB": {
      if (state.closedTabs.length === 0) return state;
      const [reopened, ...rest] = state.closedTabs;
      // 変更理由: 閉じたタブを新規タブとして開き直す時は、自動更新状態を引き継がない。
      const restored: Tab = {
        ...resetAutoRefreshState(reopened),
        id: crypto.randomUUID(),
      };
      return {
        tabs: [...state.tabs, restored],
        activeTabId: restored.id,
        closedTabs: rest,
      };
    }

    case "TOGGLE_PIN": {
      const tabs = state.tabs.map((t) =>
        t.id === action.tabId ? { ...t, pinned: !t.pinned } : t,
      );
      // 固定タブを左に、非固定タブを右に並び替え
      tabs.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
      return { ...state, tabs };
    }

    case "MOVE_TAB": {
      const fromIndex = state.tabs.findIndex((t) => t.id === action.dragTabId);
      const toIndex = state.tabs.findIndex((t) => t.id === action.targetTabId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return state;
      }

      const dragTab = state.tabs[fromIndex];
      const targetTab = state.tabs[toIndex];
      // 固定/非固定の境界を跨ぐ移動を禁止し、ピン領域と通常領域の分離を維持する。
      if (dragTab.pinned !== targetTab.pinned) {
        return state;
      }

      const nextTabs = [...state.tabs];
      const [movedTab] = nextTabs.splice(fromIndex, 1);
      nextTabs.splice(toIndex, 0, movedTab);
      return {
        ...state,
        tabs: nextTabs,
      };
    }

    case "SELECT_TAB":
      return { ...state, activeTabId: action.tabId };

    case "NAVIGATE": {
      const currentPage = getCurrentPage(getActiveTab(state));
      if (getPageIdentity(currentPage) === getPageIdentity(action.page)) {
        return state;
      }

      // 左クリック遷移でも既存タブがあればそちらを前面に出し、重複タブ化を防ぐ。
      const existingTab = findTabByCurrentPage(
        state.tabs,
        action.page,
        state.activeTabId,
      );
      if (existingTab) {
        return {
          ...state,
          activeTabId: existingTab.id,
        };
      }

      return updateActiveTab(state, (tab) =>
        resetAutoRefreshState(pushPageToTabHistory(tab, action.page)),
      );
    }

    case "NAVIGATE_TAB": {
      const targetTab = state.tabs.find((tab) => tab.id === action.tabId);
      if (!targetTab) {
        return state;
      }

      if (
        getPageIdentity(getCurrentPage(targetTab)) ===
        getPageIdentity(action.page)
      ) {
        return {
          ...state,
          activeTabId: action.tabId,
        };
      }

      const existingTab = findTabByCurrentPage(
        state.tabs,
        action.page,
        action.tabId,
      );
      if (existingTab) {
        return {
          ...state,
          activeTabId: existingTab.id,
        };
      }

      // 指定タブの実履歴を保ったままページを追加する。
      return {
        ...state,
        activeTabId: action.tabId,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId
            ? resetAutoRefreshState(pushPageToTabHistory(t, action.page))
            : t,
        ),
      };
    }

    case "GO_BACK": {
      const tab = getActiveTab(state);
      if (tab.currentIndex <= 0) return state;
      return updateActiveTab(state, () =>
        resetAutoRefreshState({
          ...tab,
          currentIndex: tab.currentIndex - 1,
        }),
      );
    }

    case "GO_FORWARD": {
      const tab = getActiveTab(state);
      if (tab.currentIndex >= tab.history.length - 1) return state;
      return updateActiveTab(state, () =>
        resetAutoRefreshState({
          ...tab,
          currentIndex: tab.currentIndex + 1,
        }),
      );
    }

    case "GO_TO_HISTORY_INDEX": {
      const tab = getActiveTab(state);
      if (action.index < 0 || action.index >= tab.history.length) return state;
      if (action.index === tab.currentIndex) return state;
      return updateActiveTab(state, () =>
        resetAutoRefreshState({
          ...tab,
          currentIndex: action.index,
        }),
      );
    }

    case "UPDATE_TITLE": {
      const tab = getActiveTab(state);
      const currentPage = { ...tab.history[tab.currentIndex] };
      currentPage.title = action.title;
      const newHistory = [...tab.history];
      newHistory[tab.currentIndex] = currentPage;
      return updateActiveTab(state, () => ({
        ...tab,
        history: newHistory,
      }));
    }

    case "UPDATE_TITLE_FOR_TAB": {
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== action.tabId) {
            return tab;
          }

          const currentPage = tab.history[tab.currentIndex];
          if (!currentPage || currentPage.title === action.title) {
            return tab;
          }

          const updatedHistory = [...tab.history];
          updatedHistory[tab.currentIndex] =
            currentPage.type === "threadList"
              ? {
                  ...currentPage,
                  // 変更理由: 板名解決後に title だけ更新すると boardTitle が URL のまま残り、
                  // 履歴候補や関連板導線で未解決ラベルが再利用されるため同時更新する。
                  title: action.title,
                  boardTitle: action.title,
                }
              : {
                  ...currentPage,
                  title: action.title,
                };

          return {
            ...tab,
            history: updatedHistory,
          };
        }),
      };
    }

    case "RELOAD":
      // 履歴を変えずにreloadKeyをインクリメントする。
      // ContentAreaがこれをkeyに使うことでページコンポーネントが再マウントされ、データ再取得が走る。
      return updateActiveTab(state, (tab) => ({
        ...tab,
        reloadKey: tab.reloadKey + 1,
      }));

    case "FOLLOW_NEXT_THREAD":
      return updateActiveTab(state, (tab) => {
        const nextTab = pushPageToTabHistory(tab, action.page);
        // 自動次スレ移動は「このタブの流れ」を保つのが目的なので、
        // 既存タブ集約を経由せず現在タブの履歴と自動更新束縛を同時に更新する。
        return {
          ...nextTab,
          autoRefreshEnabled: action.keepAutoRefresh
            ? true
            : nextTab.autoRefreshEnabled,
          autoRefreshPageKey: action.keepAutoRefresh
            ? getAutoRefreshPageKey(action.page)
            : nextTab.autoRefreshPageKey,
        };
      });

    case "SET_AUTO_REFRESH_ENABLED":
      return updateActiveTab(state, (tab) => ({
        ...tab,
        autoRefreshEnabled: action.enabled,
        autoRefreshPageKey: action.enabled
          ? (action.pageKey ?? tab.autoRefreshPageKey)
          : null,
      }));

    case "RESTORE":
      return sanitizeSessionState(action.state);

    default:
      return state;
  }
}

// --- Context ---

interface TabContextValue {
  state: TabStoreState;
  dispatch: Dispatch<TabAction>;
  activeTab: Tab;
  currentPage: Page;
}

const TabContext = createContext<TabContextValue | null>(null);
const TabDispatchContext = createContext<Dispatch<TabAction> | null>(null);

export const TabProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [state, baseDispatch] = useReducer(tabReducer, initialState);
  const stateRef = useRef(state);
  const threadVisitRef = useRef<Map<string, ThreadHistoryVisit>>(new Map());
  const activeTab = getActiveTab(state);
  const currentPage = getCurrentPage(activeTab);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const persistThreadVisit = useCallback(
    (tabId: string, page: Extract<Page, { type: "thread" }>) => {
      if (isHistoryDisabled()) {
        clearThreadVisitsForTab(threadVisitRef.current, tabId);
        return;
      }

      const date = Date.now();
      const visitKey = getThreadVisitKey(tabId, page.threadUrl);
      const visit: ThreadHistoryVisit = {
        tabId,
        threadUrl: page.threadUrl,
        title: page.title,
        boardTitle: deriveHistoryBoardTitle(page.threadUrl),
        date,
        pending: Promise.resolve(),
      };

      clearThreadVisitsForTab(threadVisitRef.current, tabId);

      visit.pending = addHistoryRecord(
        visit.threadUrl,
        visit.title,
        visit.date,
        visit.boardTitle,
      ).catch((error) => {
        reportHistoryPersistenceError("閲覧履歴の保存に失敗しました", error);
      });

      threadVisitRef.current.set(visitKey, visit);
    },
    [],
  );

  const syncThreadVisitTitle = useCallback(
    (tabId: string, page: Extract<Page, { type: "thread" }>, title: string) => {
      const visitKey = getThreadVisitKey(tabId, page.threadUrl);
      const visit = threadVisitRef.current.get(visitKey);
      if (!visit || visit.title === title || title.trim() === "") {
        return;
      }

      visit.pending = visit.pending
        .then(async () => {
          await removeHistoryRecord(visit.threadUrl, visit.date);
          await addHistoryRecord(
            visit.threadUrl,
            title,
            visit.date,
            visit.boardTitle,
          );
          visit.title = title;
        })
        .catch((error) => {
          reportHistoryPersistenceError(
            "閲覧履歴タイトルの更新に失敗しました",
            error,
          );
        });
    },
    [],
  );

  const dispatch = useCallback<Dispatch<TabAction>>(
    (action) => {
      const prevState = stateRef.current;
      const nextState = tabReducer(prevState, action);
      stateRef.current = nextState;
      baseDispatch(action);

      const recordThreadVisitForTab = (tabId: string) => {
        const nextTab = nextState.tabs.find((tab) => tab.id === tabId);
        if (!nextTab) {
          return;
        }

        const nextPage = getCurrentPage(nextTab);
        if (nextPage.type !== "thread") {
          return;
        }

        const prevTab = prevState.tabs.find((tab) => tab.id === tabId) ?? null;
        const prevPage = prevTab ? getCurrentPage(prevTab) : null;
        if (prevPage?.type === "thread" && prevPage.threadUrl === nextPage.threadUrl) {
          return;
        }

        // 変更理由: 戻る/進むではなく「開く系 action」で current page が thread に変わった瞬間に記録し、
        // 背景タブでも表示待ちなしで履歴へ出るようにする。
        persistThreadVisit(tabId, nextPage);
      };

      switch (action.type) {
        case "NAVIGATE":
        case "FOLLOW_NEXT_THREAD":
          recordThreadVisitForTab(nextState.activeTabId);
          return;

        case "NAVIGATE_TAB":
          recordThreadVisitForTab(nextState.activeTabId);
          return;

        case "OPEN_IN_NEW_TAB":
        case "OPEN_IN_NEW_TAB_FORCE":
        case "REOPEN_CLOSED_TAB": {
          const prevTabIds = new Set(prevState.tabs.map((tab) => tab.id));
          const insertedTab = nextState.tabs.find((tab) => !prevTabIds.has(tab.id));
          if (insertedTab) {
            recordThreadVisitForTab(insertedTab.id);
          }
          return;
        }

        case "UPDATE_TITLE": {
          const nextTab = nextState.tabs.find((tab) => tab.id === nextState.activeTabId);
          const nextPage = nextTab ? getCurrentPage(nextTab) : null;
          if (nextPage?.type === "thread") {
            syncThreadVisitTitle(nextState.activeTabId, nextPage, action.title);
          }
          return;
        }

        case "UPDATE_TITLE_FOR_TAB": {
          const nextTab = nextState.tabs.find((tab) => tab.id === action.tabId);
          const nextPage = nextTab ? getCurrentPage(nextTab) : null;
          if (nextPage?.type === "thread") {
            syncThreadVisitTitle(action.tabId, nextPage, action.title);
          }
          return;
        }

        default:
          return;
      }
    },
    [baseDispatch, persistThreadVisit, syncThreadVisitTitle],
  );

  // background からの新タブ追加指示を受け取り OPEN_IN_NEW_TAB をディスパッチする
  useEffect(() => {
    const handleMessage = (message: unknown) => {
      const msg = message as { type?: unknown; url?: unknown };
      if (msg.type === "open-tab-in-viewer" && typeof msg.url === "string") {
        const page = parseInternalBrowserPage(msg.url);
        if (page) {
          dispatch({ type: "OPEN_IN_NEW_TAB", page });
        }
      }
    };
    browser.runtime.onMessage.addListener(handleMessage);
    return () => {
      browser.runtime.onMessage.removeListener(handleMessage);
    };
  }, [dispatch]);

  // セッション永続化: state変更時にlocalStorageへ保存
  useEffect(() => {
    saveSession(state);
  }, [state]);

  // アクティブタブのページタイトルが変わったらウィンドウタイトルを更新する
  useEffect(() => {
    const title = currentPage.title
      ? `${currentPage.title} - read.crx 2`
      : "read.crx 2";
    platform.window.setTitle(title).catch(() => {});
  }, [currentPage.title]);

  // ブラウザの戻る/進むをアプリ内ナビゲーションに接続
  // history.pushState/popstateの状態同期に頼らず、キーボード/マウスイベントで直接制御する
  // タブ切り替え時にブラウザ履歴が汚染されるバグを回避するため
  useEffect(() => {
    // 拡張機能ページからの離脱防止用ダミー履歴エントリ
    history.replaceState({ app: true }, "");

    const handlePopState = () => {
      // ブラウザのBack/Forward操作によるページ離脱を防止し、アプリ内GO_BACKに変換
      history.pushState({ app: true }, "");
      dispatch({ type: "GO_BACK" });
    };

    // Alt+Left/Rightで戻る/進む
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          dispatch({ type: "GO_BACK" });
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          dispatch({ type: "GO_FORWARD" });
        }
      }
    };

    // マウスサイドボタン（戻る=3/進む=4）
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        dispatch({ type: "GO_BACK" });
      } else if (e.button === 4) {
        e.preventDefault();
        dispatch({ type: "GO_FORWARD" });
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dispatch]);

  return (
    <TabDispatchContext.Provider value={dispatch}>
      <TabContext.Provider value={{ state, dispatch, activeTab, currentPage }}>
        {children}
      </TabContext.Provider>
    </TabDispatchContext.Provider>
  );
};

export function useTabStore(): TabContextValue {
  const ctx = useContext(TabContext);
  if (!ctx) {
    throw new Error("useTabStore must be used within TabProvider");
  }
  return ctx;
}

export function useTabDispatch(): Dispatch<TabAction> {
  const dispatch = useContext(TabDispatchContext);
  if (!dispatch) {
    throw new Error("useTabDispatch must be used within TabProvider");
  }
  return dispatch;
}
