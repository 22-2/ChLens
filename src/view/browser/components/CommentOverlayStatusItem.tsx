import { Eye, EyeOff, MessageCircle, Play, Square } from "lucide-react";
import React, { useCallback, useEffect } from "react";
import { isTauriRuntime } from "src/app/platform/runtime";
import { useCommentOverlay } from "src/features/comment-overlay/application/use-comment-overlay";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

interface CommentOverlayStatusItemProps {
  isActive: boolean;
}

/** Tauri版のスレッドだけに実況操作を表示し、Browser版のUI契約を変えない。 */
export const CommentOverlayStatusItem: React.FC<CommentOverlayStatusItemProps> = ({ isActive }) => {
  const { currentPage } = useTabStore();
  const { controller, snapshot } = useCommentOverlay();
  const isTauri = isTauriRuntime();
  const threadUrl = currentPage.type === "thread" ? currentPage.threadUrl : null;

  const isTargetThread = threadUrl != null && snapshot.state.targetThreadUrl === threadUrl;
  const isRunning = isTargetThread && snapshot.state.status === "running";
  const canShowOverlay = isTargetThread;

  useEffect(() => {
    // 変更理由: MVPでは表示中スレッドだけを実況対象にし、タブを離れた後も
    // 非表示ThreadPageから新着を流し続ける独立実況を許可しない。背景実況は別フェーズで設計する。
    if (!isTauri || !isActive || snapshot.state.status !== "running" || isTargetThread) return;

    void controller.stop().catch((error: unknown) => {
      console.error("[ChLens] 表示中スレッドを離れたための実況停止に失敗しました:", error);
    });
  }, [controller, isActive, isTargetThread, isTauri, snapshot.state.status]);

  const handleStartStop = useCallback(() => {
    if (!threadUrl) return;

    if (isRunning) {
      void controller.stop().catch((error: unknown) => {
        console.error("[ChLens] コメント実況の停止に失敗しました:", error);
      });
      return;
    }

    void controller.start(threadUrl).catch((error: unknown) => {
      console.error("[ChLens] コメント実況の開始に失敗しました:", error);
    });
  }, [controller, isRunning, threadUrl]);

  const handleVisibility = useCallback(() => {
    if (!canShowOverlay) return;
    void controller.setVisible(!snapshot.visible).catch((error: unknown) => {
      console.error("[ChLens] コメントOverlayの表示切り替えに失敗しました:", error);
    });
  }, [canShowOverlay, controller, snapshot.visible]);

  if (!isTauri || !isActive || threadUrl == null) return null;

  const startStopLabel = isRunning ? "コメント実況を停止" : "コメント実況を開始";
  const visibilityLabel = snapshot.visible ? "コメントOverlayを非表示" : "コメントOverlayを表示";

  return (
    <StatusBarItem
      id="comment-overlay-status"
      alignment="left"
      priority={STATUS_BAR_PRIORITY.left.commentOverlay}
      title={startStopLabel}
      interactive
    >
      <span className="comment-overlay-status" aria-label="コメント実況">
        <button
          type="button"
          className="status-bar__btn"
          onClick={handleStartStop}
          title={startStopLabel}
          aria-label={startStopLabel}
        >
          {isRunning ? (
            <Square size={12} aria-hidden="true" />
          ) : (
            <Play size={12} aria-hidden="true" />
          )}
          <MessageCircle size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="status-bar__btn"
          onClick={handleVisibility}
          disabled={!canShowOverlay}
          title={visibilityLabel}
          aria-label={visibilityLabel}
        >
          {snapshot.visible ? (
            <Eye size={13} aria-hidden="true" />
          ) : (
            <EyeOff size={13} aria-hidden="true" />
          )}
        </button>
      </span>
    </StatusBarItem>
  );
};
