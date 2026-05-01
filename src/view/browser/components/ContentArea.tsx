import React from "react";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
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

export const ContentArea: React.FC = () => {
  const { state } = useTabStore();

  const tabPanels = state.tabs.map((tab) => {
    const page = getCurrentPage(tab);

    let pageContent: React.ReactNode;
    switch (page.type) {
      case "home":
        pageContent = <HomePage />;
        break;
      case "boardList":
        pageContent = <BoardListPage />;
        break;
      case "settings":
        pageContent = <SettingsPage />;
        break;
      case "bookmarkList":
        pageContent = <BookmarkListPage />;
        break;
      case "historyList":
        pageContent = <HistoryListPage />;
        break;
      case "writeHistoryList":
        pageContent = <WriteHistoryListPage />;
        break;
      case "threadList":
        pageContent = (
          <ThreadListPage
            tabId={tab.id}
            page={page}
            refreshKey={tab.reloadKey}
          />
        );
        break;
      case "thread":
        pageContent = (
          <ThreadPage tabId={tab.id} page={page} refreshKey={tab.reloadKey} />
        );
        break;
    }

    const isActive = tab.id === state.activeTabId;

    return (
      <div
        key={tab.id}
        data-tab-panel-id={tab.id}
        data-active={isActive ? "true" : "false"}
        className="content-area__tab-panel"
        style={{ display: isActive ? "block" : "none" }}
      >
        {
          // タブ切替は display:none で行い、非アクティブタブのDOM/scroll状態を保持する。
          // 一方で同一タブ内の履歴移動は従来どおり再描画を保証しつつ、
          // reload はページ内部の再取得フローへ委譲してスクロール位置を維持する。
          // ページ識別子を key にしてタブ内コンテンツだけ差し替える。
          <React.Fragment
            key={buildPageRenderKey(tab.id, tab.currentIndex, page)}
          >
            {pageContent}
          </React.Fragment>
        }
      </div>
    );
  });

  return <div className="content-area">{tabPanels}</div>;
};
