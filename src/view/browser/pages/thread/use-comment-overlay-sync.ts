import { useEffect } from "react";
import type { IRes } from "src/service-container/interfaces";
import type { CommentOverlayController } from "src/features/comment-overlay/application/controller";

type CommentOverlaySyncController = Pick<
  CommentOverlayController,
  "getSnapshot" | "stop" | "syncThread"
>;

interface UseCommentOverlaySyncOptions {
  controller: CommentOverlaySyncController;
  threadUrl: string;
  responses: readonly IRes[];
  isActive: boolean;
  expired: boolean;
  missingFromSubject: boolean;
}

/** 表示中ThreadPageの確定snapshotを実況controllerへ共有し、終了条件を伝える。 */
export function useCommentOverlaySync({
  controller,
  threadUrl,
  responses,
  isActive,
  expired,
  missingFromSubject,
}: UseCommentOverlaySyncOptions): void {
  useEffect(() => {
    if (!isActive) return;

    // 取得結果の共有だけを行い、実況中でない場合の差分計算・送信はcontroller側で止める。
    controller.syncThread(threadUrl, responses);
  }, [controller, isActive, responses, threadUrl]);

  useEffect(() => {
    if (!isActive || (!expired && !missingFromSubject)) return;

    const snapshot = controller.getSnapshot();
    if (snapshot.state.status !== "running" || snapshot.state.targetThreadUrl !== threadUrl) {
      return;
    }

    // 変更理由: dat落ち後も実況をrunningのまま残すと、Overlay表示状態だけが
    // 残留し、再表示時に終了したスレッドのsessionを再利用してしまう。通信一時失敗は
    // expiredにならないため、復旧可能な取得エラーでは実況を維持する。
    void controller.stop().catch((error: unknown) => {
      console.error("[ChLens] dat落ち後のコメント実況停止に失敗しました:", error);
    });
  }, [controller, expired, isActive, missingFromSubject, threadUrl]);
}
