import React from "react";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { HomePage } from "src/view/browser/pages/HomePage";
import { BoardListPage } from "src/view/browser/pages/BoardListPage";
import { ThreadListPage } from "src/view/browser/pages/ThreadListPage";
import { ThreadPage } from "src/view/browser/pages/ThreadPage";
import type { Page } from "src/view/browser/types";

function renderPage(page: Page): React.ReactNode {
  switch (page.type) {
    case "home":
      return <HomePage />;
    case "boardList":
      return <BoardListPage />;
    case "threadList":
      return <ThreadListPage page={page} />;
    case "thread":
      return <ThreadPage page={page} />;
  }
}

export const ContentArea: React.FC = () => {
  const { currentPage } = useTabStore();

  return (
    <div className="content-area">
      {renderPage(currentPage)}
    </div>
  );
};
