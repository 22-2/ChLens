import React from "react";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { SettingsPage } from "src/view/browser/pages/SettingsPage";
import { BoardListPage } from "src/view/browser/pages/BoardListPage";
import { HomePage } from "src/view/browser/pages/HomePage";
import { ThreadListPage } from "src/view/browser/pages/ThreadListPage";
import { ThreadPage } from "src/view/browser/pages/ThreadPage";


export const ContentArea: React.FC = () => {
  const { currentPage, activeTab } = useTabStore();
  const refreshKey = activeTab.reloadKey;

  switch (currentPage.type) {
    case "home":
      return <div className="content-area"><HomePage /></div>;
    case "boardList":
      return <div className="content-area"><BoardListPage /></div>;
    case "settings":
      return <div className="content-area"><SettingsPage /></div>;
    case "threadList":
      return (
        <div className="content-area">
          <ThreadListPage page={currentPage} refreshKey={refreshKey} />
        </div>
      );
    case "thread":
      return (
        <div className="content-area">
          <ThreadPage page={currentPage} refreshKey={refreshKey} />
        </div>
      );
  }
};
