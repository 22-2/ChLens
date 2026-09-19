import React from "react";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import {
  getThreadListPageCountKey,
  getThreadPageCountKey,
  usePageCountStatus,
} from "src/view/browser/hooks/use-page-count-status";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import {
  THREAD_FILTER_TOOLBAR_OPEN_EVENT,
  type ThreadFilterToolbarOpenDetail,
} from "src/view/browser/utils/filter-toolbar-events";

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
  const isThreadPage = currentPage.type === "thread";

  const handleThreadCountClick = () => {
    if (!isThreadPage) {
      return;
    }

    // 変更理由: ステータスバーはThreadPageの外にあるため、イベントで対象タブを
    // 明示してフィルタバーを開き、非表示タブのツールバーまで反応しないようにする。
    window.dispatchEvent(
      new window.CustomEvent<ThreadFilterToolbarOpenDetail>(THREAD_FILTER_TOOLBAR_OPEN_EVENT, {
        detail: { tabId: activeTab.id },
      }),
    );
  };

  return (
    <StatusBarItem
      id="page-count-status"
      alignment="left"
      priority={STATUS_BAR_PRIORITY.left.pageCount}
      title={isThreadPage ? `${accessibleLabel}（クリックでフィルターを開く）` : accessibleLabel}
      interactive={isThreadPage}
    >
      {isThreadPage ? (
        <button
          type="button"
          className="status-bar__btn"
          onClick={handleThreadCountClick}
          aria-label={accessibleLabel}
          title={`${accessibleLabel}（クリックでフィルターを開く）`}
        >
          <span className="status-bar__count" aria-hidden="true">
            {label}
          </span>
        </button>
      ) : (
        <span className="status-bar__count" aria-label={accessibleLabel}>
          {label}
        </span>
      )}
    </StatusBarItem>
  );
};
