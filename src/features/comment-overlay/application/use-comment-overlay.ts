import { useSyncExternalStore } from "react";
import { commentOverlayController } from "./index";

/** Main側の複数ThreadPageとステータスバーで同じ実況状態を参照する。 */
export function useCommentOverlay() {
  const snapshot = useSyncExternalStore(
    commentOverlayController.subscribe,
    commentOverlayController.getSnapshot,
    commentOverlayController.getSnapshot,
  );

  return {
    controller: commentOverlayController,
    snapshot,
  };
}
