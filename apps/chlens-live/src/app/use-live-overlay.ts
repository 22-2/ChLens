import { useEffect, useRef, useState } from "react";
import type { CommentCandidate } from "src/features/comment-overlay/domain";
import type { LiveEvent, LiveEventBus } from "../live-session/events";
import { LiveCommentOverlayController } from "../live-session/overlay-controller";

const MAX_OVERLAY_COMMENT_HISTORY = 3_000;

export interface UseLiveOverlayResult {
  threadUrl: string | null;
  comments: readonly CommentCandidate[];
  stageKey: number;
}

/** LiveThreadSessionから届くsnapshotを、OverlayStageの入力へ接続するhook。 */
export function useLiveOverlay(eventBus: LiveEventBus): UseLiveOverlayResult {
  const controllerRef = useRef<{
    eventBus: LiveEventBus;
    controller: LiveCommentOverlayController;
  } | null>(null);
  if (!controllerRef.current || controllerRef.current.eventBus !== eventBus) {
    controllerRef.current = { eventBus, controller: new LiveCommentOverlayController() };
  }
  const controller = controllerRef.current.controller;
  const [threadUrl, setThreadUrl] = useState<string | null>(null);
  const [comments, setComments] = useState<readonly CommentCandidate[]>([]);
  const [stageKey, setStageKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    const onEvent = (event: LiveEvent) => {
      const update = controller.consume(event);
      if (!update) return;

      if (update.reset) {
        setThreadUrl(update.threadUrl);
        setComments([]);
        setStageKey((current) => current + 1);
      }
      const batch = update.batch;
      if (!batch) return;

      setComments((current) => {
        const next = [...current, ...batch.comments];
        return next.length > MAX_OVERLAY_COMMENT_HISTORY
          ? next.slice(-MAX_OVERLAY_COMMENT_HISTORY)
          : next;
      });
    };

    void eventBus
      .subscribe(onEvent)
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unsubscribe = cleanup;
      })
      .catch((error: unknown) => {
        console.error("[Chlens Live] overlay event subscription failed:", error);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [controller, eventBus]);

  return { threadUrl, comments, stageKey };
}
