import { useEffect } from "react";
import type { CommentOverlayController } from "src/features/comment-overlay/application/controller";
import type { IRes } from "src/service-container/interfaces";

type CommentOverlaySyncController = Pick<CommentOverlayController, "syncThread">;

interface UseCommentOverlaySyncOptions {
  controller: CommentOverlaySyncController;
  threadUrl: string;
  responses: readonly IRes[];
  isActive: boolean;
  ownResponseNumbers?: ReadonlySet<number>;
}

/** 表示中ThreadPageの確定snapshotを実況controllerへ共有し、終了条件を伝える。 */
export function useCommentOverlaySync({
  controller,
  threadUrl,
  responses,
  isActive,
  ownResponseNumbers,
}: UseCommentOverlaySyncOptions): void {
  useEffect(() => {
    if (!isActive) return;

    // 取得結果の共有だけを行い、実況中でない場合の差分計算・送信はcontroller側で止める。
    if (ownResponseNumbers == null) {
      controller.syncThread(threadUrl, responses);
      return;
    }
    // 変更理由: own判定を同じsnapshotと一緒にcontrollerへ渡し、
    // Overlayでも自分のレスを本文側と同じ黄色枠で流せるようにする。
    controller.syncThread(threadUrl, responses, { ownResponseNumbers });
  }, [controller, isActive, ownResponseNumbers, responses, threadUrl]);
}
