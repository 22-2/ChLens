import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { SettingsPage } from "src/view/browser/pages/SettingsPage";
import { BoardListPage } from "src/view/browser/pages/BoardListPage";
import { HomePage } from "src/view/browser/pages/HomePage";
import { ThreadListPage } from "src/view/browser/pages/ThreadListPage";
import { ThreadPage } from "src/view/browser/pages/ThreadPage";
import type { Page } from "src/view/browser/types";

function buildContentScrollKey(
  tabId: string,
  historyIndex: number,
  page: Page,
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
    case "home":
      return `${tabId}:${historyIndex}:home`;
  }
}

function restoreScrollPosition(
  element: HTMLDivElement,
  position: { top: number; left: number },
): void {
  if (typeof element.scrollTo === "function") {
    element.scrollTo({
      top: position.top,
      left: position.left,
      behavior: "auto",
    });
    return;
  }

  element.scrollTop = position.top;
  element.scrollLeft = position.left;
}

export const ContentArea: React.FC = () => {
  const { currentPage, activeTab } = useTabStore();
  const refreshKey = activeTab.reloadKey;
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef(
    new Map<string, { top: number; left: number }>(),
  );
  const pageScrollKey = useMemo(
    () => buildContentScrollKey(activeTab.id, activeTab.currentIndex, currentPage),
    [activeTab.currentIndex, activeTab.id, currentPage],
  );

  useLayoutEffect(() => {
    const contentArea = contentAreaRef.current;
    if (!contentArea) {
      return;
    }

    const storedPosition = scrollPositionsRef.current.get(pageScrollKey) ?? {
      top: 0,
      left: 0,
    };
    restoreScrollPosition(contentArea, storedPosition);

    return () => {
      // タブ/ページ切り替えの直前に共有スクロールコンテナの位置を退避して、
      // 戻ってきた時だけそのページ固有の位置を復元する。
      scrollPositionsRef.current.set(pageScrollKey, {
        top: contentArea.scrollTop,
        left: contentArea.scrollLeft,
      });
    };
  }, [pageScrollKey]);

  let pageContent: React.ReactNode;

  switch (currentPage.type) {
    case "home":
      pageContent = <HomePage />;
      break;
    case "boardList":
      pageContent = <BoardListPage />;
      break;
    case "settings":
      pageContent = <SettingsPage />;
      break;
    case "threadList":
      pageContent = <ThreadListPage page={currentPage} refreshKey={refreshKey} />;
      break;
    case "thread":
      pageContent = <ThreadPage page={currentPage} refreshKey={refreshKey} />;
      break;
  }

  return (
    <div ref={contentAreaRef} className="content-area">
      {pageContent}
    </div>
  );
};
