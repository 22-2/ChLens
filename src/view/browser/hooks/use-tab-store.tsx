import React, {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { type Tab, type Page, getCurrentPage } from "../types";

// TabState をここで型定義（types.tsにも追加する）
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
  | { type: "UPDATE_TITLE"; title: string };

function createTab(): Tab {
  return {
    id: crypto.randomUUID(),
    history: [{ type: "home", title: "ホーム" }],
    currentIndex: 0,
  };
}

const initialTab = createTab();

const initialState: TabStoreState = {
  tabs: [initialTab],
  activeTabId: initialTab.id,
};

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
      const tab = getActiveTab(state);
      // 現在位置より先の履歴を切り捨てて新ページを追加
      const newHistory = [
        ...tab.history.slice(0, tab.currentIndex + 1),
        action.page,
      ];
      return updateActiveTab(state, () => ({
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
