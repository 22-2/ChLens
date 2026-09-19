import React from "react";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import {
  getThreadListPageCountKey,
  getThreadPageCountKey,
  usePageCountStatus,
} from "src/view/browser/hooks/use-page-count-status";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

function formatCount(count: number | null | undefined): string {
  return count == null ? "..." : count.toLocaleString();
}

export const PageCountStatusItem: React.FC = () => {
  const { activeTab, currentPage } = useTabStore();
  const { getPageCount } = usePageCountStatus();

  const pageInfo =
    currentPage.type === "thread"
      ? {
          key: getThreadPageCountKey(activeTab.id, currentPage.threadUrl),
          suffix: "レス",
          name: "レス数",
        }
      : currentPage.type === "threadList"
        ? {
            key: getThreadListPageCountKey(activeTab.id, currentPage.boardUrl),
            suffix: "スレ",
            name: "スレ数",
          }
        : null;

  if (!pageInfo) {
    return null;
  }

  const label = `${formatCount(getPageCount(pageInfo.key)?.count)}${pageInfo.suffix}`;
  const accessibleLabel = `現在の${pageInfo.name}: ${label}`;

  return (
    <StatusBarItem
      id="page-count-status"
      alignment="left"
      priority={STATUS_BAR_PRIORITY.left.pageCount}
      title={accessibleLabel}
    >
      <span className="status-bar__count" aria-label={accessibleLabel}>
        {label}
      </span>
    </StatusBarItem>
  );
};
