import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  buildHierarchy,
  getCurrentPage,
  type Page,
  type Tab,
} from "src/view/browser/types";

export interface TabStoreState {
  tabs: Tab[];
  activeTabId: string;
  closedTabs: Tab[];
}

export type TabAction =
  | { type: "ADD_TAB" }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "CLOSE_OTHER_TABS"; tabId: string }
  | { type: "CLOSE_RIGHT_TABS"; tabId: string }
  | { type: "CLOSE_ALL_TABS" }
  | { type: "REOPEN_CLOSED_TAB" }
  | { type: "TOGGLE_PIN"; tabId: string }
  | { type: "SELECT_TAB"; tabId: string }
  | { type: "NAVIGATE"; page: Page }
  | { type: "NAVIGATE_TAB"; tabId: string; page: Page }
  | { type: "GO_BACK" }
  | { type: "GO_FORWARD" }
  | { type: "UPDATE_TITLE"; title: string }
  | { type: "RELOAD" }
  | { type: "RESTORE"; state: TabStoreState };

// 閉じたタブの最大保持数
const MAX_CLOSED_TABS = 20;
const SESSION_KEY = "readcrx_browser_session";

function createTab(): Tab {
  return {
    id: crypto.randomUUID(),
    history: [{ type: "home", title: "ホーム" }],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
  };
}

// セッション復元: localStorageから前回の状態を読み込む
function loadSession(): TabStoreState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TabStoreState;
    if (parsed.tabs?.length > 0 && parsed.activeTabId) {
      // 旧フォーマット互換: 無いフィールドを補完
      for (const tab of parsed.tabs) {
        if (tab.pinned === undefined) tab.pinned = false;
        if (tab.reloadKey === undefined) tab.reloadKey = 0;
      }
      if (!parsed.closedTabs) parsed.closedTabs = [];
      return parsed;
    }
  } catch {
    // パース失敗時は無視
  }
  return null;
}

function saveSession(state: TabStoreState): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // 容量超過等は無視
  }
}

const restoredSession = loadSession();
const initialState: TabStoreState = restoredSession ?? {
  tabs: [createTab()],
  activeTabId: "",
  closedTabs: [],
};
// 新規作成時にactiveTabIdを設定
if (!restoredSession) {
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

// 閉じたタブを記録するヘルパー
function pushClosed(closedTabs: Tab[], tab: Tab): Tab[] {
  return [tab, ...closedTabs].slice(0, MAX_CLOSED_TABS);
}

function tabReducer(state: TabStoreState, action: TabAction): TabStoreState {
  switch (action.type) {
    case "ADD_TAB": {
      const newTab = createTab();
      // 固定タブの後ろに非固定タブを追加
      return {
        ...state,
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
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
      const newTab = createTab();
      return {
        tabs: [...pinned, newTab],
        activeTabId: newTab.id,
        closedTabs: newClosed,
      };
    }

    case "REOPEN_CLOSED_TAB": {
      if (state.closedTabs.length === 0) return state;
      const [reopened, ...rest] = state.closedTabs;
      // 新しいIDを振り直して復元
      const restored: Tab = { ...reopened, id: crypto.randomUUID() };
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

    case "SELECT_TAB":
      return { ...state, activeTabId: action.tabId };

    case "NAVIGATE": {
      const newHistory = buildHierarchy(action.page);
      return updateActiveTab(state, (tab) => ({
        ...tab,
        history: newHistory,
        currentIndex: newHistory.length - 1,
      }));
    }

    case "NAVIGATE_TAB": {
      // 指定タブにナビゲートしてアクティブにする
      const newHistory = buildHierarchy(action.page);
      return {
        ...state,
        activeTabId: action.tabId,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId
            ? { ...t, history: newHistory, currentIndex: newHistory.length - 1 }
            : t,
        ),
      };
    }

    case "GO_BACK": {
      const tab = getActiveTab(state);
      if (tab.currentIndex <= 0) return state;
      return updateActiveTab(state, () => ({
        ...tab,
        currentIndex: tab.currentIndex - 1,
      }));
    }

    case "GO_FORWARD": {
      const tab = getActiveTab(state);
      if (tab.currentIndex >= tab.history.length - 1) return state;
      return updateActiveTab(state, () => ({
        ...tab,
        currentIndex: tab.currentIndex + 1,
      }));
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

    case "RELOAD":
      // 履歴を変えずにreloadKeyをインクリメントする。
      // ContentAreaがこれをkeyに使うことでページコンポーネントが再マウントされ、データ再取得が走る。
      return updateActiveTab(state, (tab) => ({
        ...tab,
        reloadKey: tab.reloadKey + 1,
      }));

    case "RESTORE":
      return action.state;

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

export const TabProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(tabReducer, initialState);
  const activeTab = getActiveTab(state);
  const currentPage = getCurrentPage(activeTab);

  // セッション永続化: state変更時にlocalStorageへ保存
  useEffect(() => {
    saveSession(state);
  }, [state]);

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
    <TabContext.Provider value={{ state, dispatch, activeTab, currentPage }}>
      {children}
    </TabContext.Provider>
  );
};

export function useTabStore(): TabContextValue {
  const ctx = useContext(TabContext);
  if (!ctx) {
    throw new Error("useTabStore must be used within TabProvider");
  }
  return ctx;
}
