import React from "react";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import type { Tab } from "src/view/browser/types";
import { BoardListPage } from "src/view/browser/pages/BoardListPage";
import { BookmarkListPage } from "src/view/browser/pages/BookmarkListPage";
import { HistoryListPage } from "src/view/browser/pages/HistoryListPage";
import { HomePage } from "src/view/browser/pages/HomePage";
import { SettingsPage } from "src/view/browser/pages/SettingsPage";
import { ThreadListPage } from "src/view/browser/pages/ThreadListPage";
import { ThreadPage } from "src/view/browser/pages/ThreadPage";
import { WriteHistoryListPage } from "src/view/browser/pages/WriteHistoryListPage";
import { getCurrentPage } from "src/view/browser/types";

function buildPageRenderKey(
  tabId: string,
  historyIndex: number,
  page: ReturnType<typeof getCurrentPage>,
): string {
  switch (page.type) {
    case "thread":
      return `${tabId}:${historyIndex}:thread:${page.threadUrl}`;
    case "threadList":
      return `${tabId}:${historyIndex}:threadList:${page.boardUrl}`;
    case "boardList":
      return `${tabId}:${historyIndex}:boardList`;
    case "settings":
      return `${tabId}:${historyIndex}:settings`;
    case "bookmarkList":
      return `${tabId}:${historyIndex}:bookmarkList`;
    case "historyList":
      return `${tabId}:${historyIndex}:historyList`;
    case "writeHistoryList":
      return `${tabId}:${historyIndex}:writeHistoryList`;
    case "home":
      return `${tabId}:${historyIndex}:home`;
  }
}

interface TabPageContentProps {
  tab: Tab;
  threadListActive?: boolean;
}

const TabPageContent = React.memo(function TabPageContent({
  tab,
  threadListActive,
}: TabPageContentProps) {
  const page = getCurrentPage(tab);

  switch (page.type) {
    case "home":
      return <HomePage />;
    case "boardList":
      return <BoardListPage />;
    case "settings":
      return <SettingsPage />;
    case "bookmarkList":
      return <BookmarkListPage />;
    case "historyList":
      return <HistoryListPage tabId={tab.id} />;
    case "writeHistoryList":
      return <WriteHistoryListPage tabId={tab.id} />;
    case "threadList":
      return (
        <ThreadListPage
          tabId={tab.id}
          page={page}
          refreshKey={tab.reloadKey}
          isActive={threadListActive ?? false}
        />
      );
    case "thread":
      return (
        <ThreadPage
          tabId={tab.id}
          page={page}
          refreshKey={tab.reloadKey}
          // 自動更新の可否をタブ自身の状態へ固定すると、
          // アクティブタブ変更だけで他スレッドまで再計算されなくなる。
          isAutoRefreshEnabled={
            tab.autoRefreshEnabled && tab.autoRefreshThreadUrl === page.threadUrl
          }
        />
      );
  }
});

interface TabPanelProps {
  tab: Tab;
  isActive: boolean;
}

const TabPanel = React.memo(function TabPanel({ tab, isActive }: TabPanelProps) {
  const page = getCurrentPage(tab);

  return (
    <div
      data-tab-panel-id={tab.id}
      data-active={isActive ? "true" : "false"}
      className="content-area__tab-panel"
      style={{ display: isActive ? "block" : "none" }}
    >
      {
        // display 切替で DOM/scroll を残しつつ、
        // ページ本体はタブ自身が変わった時だけ再実行させる。
        <TabPageContent
          key={buildPageRenderKey(tab.id, tab.currentIndex, page)}
          tab={tab}
          threadListActive={page.type === "threadList" ? isActive : undefined}
        />
      }
    </div>
  );
});

export const ContentArea: React.FC = () => {
  const { state } = useTabStore();

  return (
    <div className="content-area">
      {state.tabs.map((tab) => (
        <TabPanel
          key={tab.id}
          tab={tab}
          isActive={tab.id === state.activeTabId}
        />
      ))}
    </div>
  );
};
