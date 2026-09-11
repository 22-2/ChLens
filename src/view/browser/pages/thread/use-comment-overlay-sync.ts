import { useEffect } from "react";
import type { IRes } from "src/service-container/interfaces";
import type { CommentOverlayController } from "src/features/comment-overlay/application/controller";

type CommentOverlaySyncController = Pick<CommentOverlayController, "syncThread">;

interface UseCommentOverlaySyncOptions {
  controller: CommentOverlaySyncController;
  threadUrl: string;
  responses: readonly IRes[];
  isActive: boolean;
}

/** 表示中ThreadPageの確定snapshotを実況controllerへ共有し、終了条件を伝える。 */
export function useCommentOverlaySync({
  controller,
  threadUrl,
  responses,
  isActive,
}: UseCommentOverlaySyncOptions): void {
  useEffect(() => {
    if (!isActive) return;

    // 取得結果の共有だけを行い、実況中でない場合の差分計算・送信はcontroller側で止める。
    controller.syncThread(threadUrl, responses);
  }, [controller, isActive, responses, threadUrl]);
}
