import React from "react";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import {
  getThreadListPageCountKey,
  getThreadPageCountKey,
  usePageCountStatus,
} from "src/view/browser/hooks/use-page-count-status";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import {
  THREAD_FILTER_TOOLBAR_OPEN_EVENT,
  type ThreadFilterToolbarToggleDetail,
} from "src/view/browser/utils/filter-toolbar-events";

function formatCount(count: number | null | undefined): string {
  return count == null ? "..." : count.toLocaleString();
}

export const PageCountStatusItem: React.FC = () => {
  const { viewTab, viewPage } = useTabStore();
  const { getPageCount } = usePageCountStatus();
  const { window: viewWindow, document: viewDocument } = useViewSurface();

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
  // 絞り込み中は「表示件数/全体件数」で示し、フィルタの効き具合をステータスバーだけで分かるようにする。
  const label = filteredCount == null ? totalLabel : `${formatCount(filteredCount)}/${totalLabel}`;
  const accessibleLabel = `現在の${pageInfo.name}: ${label}`;
  const isThreadPage = viewPage.type === "thread";

  const handleThreadCountClick = () => {
    if (!isThreadPage) {
      return;
    }

    // 変更理由: 件数表示はバーを開く導線として扱い、常時表示中に誤って閉じないようtoggleと分ける。
    // ステータスバーはThreadPageの外にあるため、イベントで対象タブを明示する。
    // CustomEventのコンストラクタを本窓から借りず、表示先Documentのイベントとして生成する。
    const event = viewDocument.createEvent(
      "CustomEvent",
    ) as CustomEvent<ThreadFilterToolbarToggleDetail>;
    event.initCustomEvent(THREAD_FILTER_TOOLBAR_OPEN_EVENT, false, false, {
      tabId: viewTab.id,
    });
    viewWindow.dispatchEvent(event);
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
