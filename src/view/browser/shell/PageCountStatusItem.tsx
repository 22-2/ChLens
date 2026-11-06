import { MessagesSquare } from "lucide-react";
import React from "react";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { openFilter } from "src/view/browser/extension/page-actions";
import {
  getThreadListPageCountKey,
  getThreadPageCountKey,
  usePageCountStatus,
} from "src/view/browser/hooks/use-page-count-status";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";

function formatCount(count: number | null | undefined): string {
  return count == null ? "..." : count.toLocaleString();
}

export const PageCountStatusItem: React.FC = () => {
  const { viewTab, viewPage } = useTabStore();
  const { getPageCount } = usePageCountStatus();
  const { window: viewWindow } = useViewSurface();

  const pageInfo =
    viewPage.type === "thread"
      ? {
          key: getThreadPageCountKey(viewTab.id, viewPage.threadUrl),
          suffix: "レス",
          name: "レス数",
        }
      : viewPage.type === "threadList"
        ? {
            key: getThreadListPageCountKey(viewTab.id, viewPage.boardUrl),
            suffix: "スレ",
            name: "スレ数",
          }
        : null;

  if (!pageInfo) {
    return null;
  }

  const pageCount = getPageCount(pageInfo.key);
  const filteredCount = pageCount?.filteredCount;
  const totalLabel = `${formatCount(pageCount?.count)}${pageInfo.suffix}`;
  // 全体に対する表示数として読めるよう、原因にかかわらず表示数を先に示す。
  const label =
    filteredCount == null
      ? totalLabel
      : `${formatCount(filteredCount)} / ${formatCount(pageCount?.count)}${pageInfo.suffix}`;
  const accessibleLabel = `現在の${pageInfo.name}: ${label}`;
  const isThreadPage = viewPage.type === "thread";

  const handleThreadCountClick = () => {
    if (!isThreadPage) {
      return;
    }

    // 絞り込み中に押しても解除せず、フィルタバーを開いて状態を見せる。
    openFilter(viewWindow, viewTab.id);
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
          <MessagesSquare size={13} aria-hidden="true" />
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
