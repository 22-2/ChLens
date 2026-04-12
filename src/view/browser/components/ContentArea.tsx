import React from "react";
import { useTabStore } from "../hooks/use-tab-store";
import { HomePage } from "../pages/HomePage";
import { BoardListPage } from "../pages/BoardListPage";
import { ThreadListPage } from "../pages/ThreadListPage";
import { ThreadPage } from "../pages/ThreadPage";
import type { Page } from "../types";

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
