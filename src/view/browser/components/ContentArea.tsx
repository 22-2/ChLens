import { type FC, memo, useEffect, useRef, useState, type RefObject } from "react";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { BoardListPage } from "src/view/browser/pages/BoardListPage";
import { BookmarkListPage } from "src/view/browser/pages/BookmarkListPage";
import { HistoryListPage } from "src/view/browser/pages/HistoryListPage";
import { HomePage } from "src/view/browser/pages/HomePage";
import { LogListPage } from "src/view/browser/pages/LogListPage";
import { SettingsPage } from "src/view/browser/pages/SettingsPage";
import { ThreadListPage } from "src/view/browser/pages/ThreadListPage";
import { ThreadPage } from "src/view/browser/pages/ThreadPage";
import { WriteHistoryListPage } from "src/view/browser/pages/WriteHistoryListPage";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";
import { isAutoRefreshEnabledForPage } from "src/view/browser/utils/auto-refresh-pages";

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
    case "logList":
      return `${tabId}:${historyIndex}:logList`;
    case "home":
      return `${tabId}:${historyIndex}:home`;
  }
}

interface TabPageContentProps {
  tab: Tab;
  isActive: boolean;
  threadListActive?: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

const TabPageContent = memo(function TabPageContent({
  tab,
  isActive,
  threadListActive,
  scrollContainerRef,
}: TabPageContentProps) {
  const page = getCurrentPage(tab);

  switch (page.type) {
    case "home":
      return <HomePage />;
    case "boardList":
      return <BoardListPage tabId={tab.id} isActive={isActive} />;
    case "settings":
      return <SettingsPage page={page} />;
    case "bookmarkList":
      // isActive をpropsで渡すことで、ページ内部のuseTabStoreフル購読を避けて不要な再レンダリングを防ぐ。
      return <BookmarkListPage tabId={tab.id} isActive={isActive} />;
    case "historyList":
      return <HistoryListPage tabId={tab.id} isActive={isActive} refreshKey={tab.reloadKey} />;
    case "writeHistoryList":
      return <WriteHistoryListPage tabId={tab.id} isActive={isActive} refreshKey={tab.reloadKey} />;
    case "logList":
      return <LogListPage tabId={tab.id} isActive={isActive} refreshKey={tab.reloadKey} />;
    case "threadList":
      return (
        <ThreadListPage
          tabId={tab.id}
          page={page}
          refreshKey={tab.reloadKey}
          isActive={threadListActive ?? false}
          isAutoRefreshEnabled={isAutoRefreshEnabledForPage(tab, page)}
          scrollContainerRef={scrollContainerRef}
        />
      );
    case "thread":
      return (
        <ThreadPage
          tabId={tab.id}
          page={page}
          refreshKey={tab.reloadKey}
          isActive={isActive}
          isAutoRefreshEnabled={isAutoRefreshEnabledForPage(tab, page)}
          scrollContainerRef={scrollContainerRef}
        />
      );
  }
});

interface TabPanelProps {
  tab: Tab;
  isActive: boolean;
}

const TabPanel = memo(function TabPanel({ tab, isActive }: TabPanelProps) {
  const page = getCurrentPage(tab);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // パフォーマンス向上とメモリ節約のため、バックグラウンドで開かれたタブ（まだ一度も表示されていないタブ）は
  // 初回表示（アクティブ化）されるまでDOMのマウントおよびレンダリングを遅延させる。
  const [hasRendered, setHasRendered] = useState(isActive);

  useEffect(() => {
    if (isActive && !hasRendered) {
      setHasRendered(true);
    }
  }, [isActive, hasRendered]);

  if (!hasRendered && !isActive) {
    return null;
  }

  return (
    <div
      data-tab-panel-id={tab.id}
      ref={scrollContainerRef}
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
          isActive={isActive}
          threadListActive={page.type === "threadList" ? isActive : undefined}
          scrollContainerRef={scrollContainerRef}
        />
      }
    </div>
  );
});

export const ContentArea: FC = () => {
  const { state } = useTabStore();

  return (
    <div className="content-area">
      {state.tabs.map((tab) => (
        <TabPanel key={tab.id} tab={tab} isActive={tab.id === state.activeTabId} />
      ))}
    </div>
  );
};
