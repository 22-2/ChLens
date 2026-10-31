import { useCallback } from "react";
import { createLogger } from "src/app/logger";
import type { useCommentOverlay } from "src/features/comment-overlay/application/use-comment-overlay";
import type { useTabViewRuntime } from "src/features/tabs/browser/use-tab-view-runtime";
import type { IThread } from "src/service-container/interfaces";
import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";

const logger = createLogger("view/browser");

/** 自動更新の開始・停止と、次スレへの移動・探索終了など、自動更新に関わる操作のコールバックを組み立てる。 */
export function useThreadAutoRefreshActions({
  page,
  autoRefreshPageKey,
  canAutoRefresh,
  isAutoRefreshEnabled,
  isNextThreadWaiting,
  dispatch,
  toast,
  commentOverlayController,
}: {
  page: ThreadPageType;
  autoRefreshPageKey: ReturnType<typeof getAutoRefreshPageKey>;
  canAutoRefresh: boolean;
  isAutoRefreshEnabled: boolean;
  /** 次スレ探索の待機中。待機の続きとして次スレへ移るため、自動更新の引き継ぎに含める。 */
  isNextThreadWaiting: boolean;
  dispatch: ReturnType<typeof useTabStore>["dispatch"];
  toast: ReturnType<typeof useTabViewRuntime>["toast"];
  commentOverlayController: ReturnType<typeof useCommentOverlay>["controller"];
}) {
  // 変更理由: 停止理由が増えても、タブ状態の解除と利用者への通知を同じ経路で行い、
  // 一方だけ実行される不整合を防ぐ。
  const handleAutoRefreshStop = useCallback(
    (message: string) => {
      const pageKey = getAutoRefreshPageKey(page);
      if (pageKey == null) {
        return;
      }
      dispatch(tabActions.setAutoRefreshEnabled(false, pageKey));
      toast.info(message);
    },
    [dispatch, page, toast],
  );

  const handleEnableAutoRefresh = useCallback(() => {
    const pageKey = getAutoRefreshPageKey(page);
    if (!canAutoRefresh || pageKey == null) {
      return;
    }

    // 既存の自動更新トグルと同じ状態経路を使い、フローティングボタンだけが
    // 別の更新条件を持たないようにする。ON直後の再取得と最下部同期はhookへ委譲する。
    dispatch(tabActions.setAutoRefreshEnabled(true, pageKey));
  }, [dispatch, page, canAutoRefresh]);

  const handleNextThreadSearchExhausted = useCallback(() => {
    if (autoRefreshPageKey == null) {
      return;
    }
    // 実況中も期限で終了し、開始連打や別窓への移動で同じ満了スレの探索を再開させない。
    dispatch(tabActions.setAutoRefreshStoppedPageKey(autoRefreshPageKey));
    toast.info("次スレが見つからなかったため自動更新を停止しました");
  }, [autoRefreshPageKey, dispatch, toast]);

  const handleFollowNextThread = useCallback(
    (nextThread: Pick<IThread, "title" | "url">) => {
      // 変更理由: 次スレへの切り替えは本文の再描画だけでは分かりにくく、
      // Overlay上へ通知を流すことで画面を見続けている利用者にも接続先を伝える。
      void commentOverlayController
        .publishSystemMessage(page.threadUrl, `スレ「${nextThread.title}」へ移動します。`)
        .catch((error: unknown) => {
          logger.error("次スレ移動の通知コメント送信に失敗しました:", error);
        });
      dispatch(
        tabActions.followNextThread(
          {
            type: "thread",
            title: nextThread.title,
            threadUrl: nextThread.url,
          },
          // 待機中の移動も、待機前から続いていた自動更新の引き継ぎとして扱う。
          { keepAutoRefresh: isAutoRefreshEnabled || isNextThreadWaiting },
        ),
      );
    },
    [commentOverlayController, dispatch, isAutoRefreshEnabled, isNextThreadWaiting, page.threadUrl],
  );

  return {
    handleAutoRefreshStop,
    handleEnableAutoRefresh,
    handleNextThreadSearchExhausted,
    handleFollowNextThread,
  };
}
