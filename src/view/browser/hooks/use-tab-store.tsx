import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import { type Tab, type Page, getCurrentPage, buildHierarchy } from "../types";

export interface TabStoreState {
  tabs: Tab[];
  activeTabId: string;
}

export type TabAction =
  | { type: "ADD_TAB" }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "SELECT_TAB"; tabId: string }
  | { type: "NAVIGATE"; page: Page }
  | { type: "GO_BACK" }
  | { type: "GO_FORWARD" }
  | { type: "UPDATE_TITLE"; title: string }
  | { type: "RESTORE"; state: TabStoreState };

const SESSION_KEY = "readcrx_browser_session";

function createTab(): Tab {
  return {
    id: crypto.randomUUID(),
    history: [{ type: "home", title: "ホーム" }],
    currentIndex: 0,
  };
}

// セッション復元: localStorageから前回の状態を読み込む
function loadSession(): TabStoreState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TabStoreState;
    if (parsed.tabs?.length > 0 && parsed.activeTabId) {
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
  updater: (tab: Tab) => Tab
): TabStoreState {
  return {
    ...state,
    tabs: state.tabs.map((t) =>
      t.id === state.activeTabId ? updater(t) : t
    ),
  };
}

function tabReducer(state: TabStoreState, action: TabAction): TabStoreState {
  switch (action.type) {
    case "ADD_TAB": {
      const newTab = createTab();
      return {
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      };
    }

    case "CLOSE_TAB": {
      // 最後の1タブは閉じない
      if (state.tabs.length <= 1) return state;
      const closingIndex = state.tabs.findIndex(
        (t) => t.id === action.tabId
      );
      const remaining = state.tabs.filter((t) => t.id !== action.tabId);
      let newActiveId = state.activeTabId;
      if (action.tabId === state.activeTabId) {
        // 閉じたタブがアクティブだった場合、左隣（なければ右隣）に切り替え
        const newIndex = Math.min(closingIndex, remaining.length - 1);
        newActiveId = remaining[newIndex].id;
      }
      return { tabs: remaining, activeTabId: newActiveId };
    }

    case "SELECT_TAB":
      return { ...state, activeTabId: action.tabId };

    case "NAVIGATE": {
      // 常にページ種別に応じた階層スタックを構築する
      // ホーム → 板一覧 → スレッド一覧 → スレッド の固定構造を維持
      const newHistory = buildHierarchy(action.page);
      return updateActiveTab(state, (tab) => ({
        ...tab,
        history: newHistory,
        currentIndex: newHistory.length - 1,
      }));
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
  const isPopStateRef = useRef(false);
  useEffect(() => {
    // 初回: history stateを設定
    history.replaceState({ idx: 0 }, "");
    let currentIdx = 0;

    const handlePopState = (e: PopStateEvent) => {
      const newIdx = e.state?.idx ?? 0;
      isPopStateRef.current = true;
      if (newIdx < currentIdx) {
        dispatch({ type: "GO_BACK" });
      } else {
        dispatch({ type: "GO_FORWARD" });
      }
      currentIdx = newIdx;
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // NAVIGATEアクション時にhistory.pushStateを追加して
  // ブラウザの戻る/進むボタンで遷移できるようにする
  const prevPageRef = useRef(currentPage);
  useEffect(() => {
    if (isPopStateRef.current) {
      // popstateトリガーの場合はpushStateしない（二重登録防止）
      isPopStateRef.current = false;
      prevPageRef.current = currentPage;
      return;
    }
    if (prevPageRef.current !== currentPage) {
      const idx = (history.state?.idx ?? 0) + 1;
      history.pushState({ idx }, "");
      prevPageRef.current = currentPage;
    }
  }, [currentPage]);

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
