import { useEffect } from "react";
import { createLogger } from "src/app/logger";
import type { useCommentOverlay } from "src/features/comment-overlay/application/use-comment-overlay";
import type { useThreadData } from "src/features/thread/browser/use-thread-data";
import type { Tab, ThreadPage as ThreadPageType } from "src/view/browser/types";

const logger = createLogger("view/browser");

type ThreadDataResult = ReturnType<typeof useThreadData>;
type CommentOverlay = ReturnType<typeof useCommentOverlay>;

/** 次スレ移動後も、同じタブで直前のスレッドを対象にしていたコメント実況を新スレッドへ引き継ぐ。 */
export function useCommentOverlayHandoff({
  page,
  responses,
  loading,
  isOverlayTarget,
  isAutoRefreshEnabled,
  isCommentOverlayVisible,
  commentOverlaySnapshot,
  navigationTab,
  commentOverlayController,
  ownResNums,
}: {
  page: ThreadPageType;
  responses: ThreadDataResult["responses"];
  loading: boolean;
  isOverlayTarget: boolean;
  isAutoRefreshEnabled: boolean;
  isCommentOverlayVisible: boolean;
  commentOverlaySnapshot: CommentOverlay["snapshot"];
  navigationTab: Tab;
  commentOverlayController: CommentOverlay["controller"];
  ownResNums: ReadonlySet<number>;
}) {
  useEffect(() => {
    if (
      !isOverlayTarget ||
      !isAutoRefreshEnabled ||
      !isCommentOverlayVisible ||
      loading ||
      responses.length === 0
    ) {
      return;
    }
    const previousPage = navigationTab.history[navigationTab.currentIndex - 1];
    if (
      previousPage?.type !== "thread" ||
      previousPage.threadUrl !== commentOverlaySnapshot.state.targetThreadUrl ||
      page.threadUrl === commentOverlaySnapshot.state.targetThreadUrl
    ) {
      return;
    }

    // 変更理由: 次スレ移動では同じタブの直前スレッドをOverlay対象としているため、
    // 新スレッドの初回取得完了後にbaselineごと切り替え、旧レスを流さず表示を継続する。
    void commentOverlayController
      .start(page.threadUrl, responses, {
        preserveVisibleComments: true,
        ownResponseNumbers: ownResNums,
      })
      .catch((error: unknown) => {
        logger.error("次スレ移動後のコメント実況引き継ぎに失敗しました:", error);
      });
  }, [
    navigationTab.currentIndex,
    navigationTab.history,
    commentOverlayController,
    commentOverlaySnapshot.state.targetThreadUrl,
    isAutoRefreshEnabled,
    isCommentOverlayVisible,
    isOverlayTarget,
    loading,
    ownResNums,
    page.threadUrl,
    responses,
  ]);
}
