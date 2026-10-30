import React, { useEffect, useState } from "react";
import { useThreadListLoadedAt } from "src/features/thread-list/ui/thread-list-loaded-at";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { formatRelativeTime } from "src/view/browser/utils/date-time";

// 経過秒数（「5秒前」など）を古くしないための再描画間隔。
const RELATIVE_TIME_REFRESH_MS = 1_000;

// スレ一覧を開いている間、ステータスバー右側に最終読み込みからの経過時間を常に表示する。
export const ThreadListLoadedStatusItem: React.FC = () => {
  const { viewTab, viewPage } = useTabStore();
  const loadedAt = useThreadListLoadedAt(viewTab.id);
  const { window: viewWindow } = useViewSurface();
  // 表示時刻は描画のたびに Date.now() で求め、この state は再描画の契機にだけ使う。
  const [, setTick] = useState(0);
  const isThreadList = viewPage.type === "threadList";

  useEffect(() => {
    if (!isThreadList) return;

    const timerId = viewWindow.setInterval(() => {
      setTick((tick) => tick + 1);
    }, RELATIVE_TIME_REFRESH_MS);
    return () => {
      viewWindow.clearInterval(timerId);
    };
  }, [isThreadList, viewWindow]);

  if (!isThreadList) {
    return null;
  }

  // 読み込みがまだ成功していない（キャッシュ表示のみなど）間は時刻が分からないため「-」を出す。
  const label =
    loadedAt == null ? "-" : formatRelativeTime(loadedAt, Date.now(), { showSeconds: true });

  return (
    <StatusBarItem
      id="thread-list-loaded"
      alignment="right"
      priority={STATUS_BAR_PRIORITY.right.threadListLoaded}
      title={`スレ一覧の最終読み込み: ${label}`}
    >
      <span className="status-bar__count" aria-label={`最終読み込み: ${label}`}>
        最終読み込み {label}
      </span>
    </StatusBarItem>
  );
};
