import { useEffect, useRef, useState } from "react";
import {
  calculateNaturalCommentFlowCount,
  calculateNaturalCommentFlowInterval,
  type CommentCandidate,
} from "src/features/comment-overlay/domain";

import type { LiveEvent, LiveEventBus } from "../live-session/events";
import { LiveCommentOverlayController } from "../live-session/overlay-controller";

const MAX_OVERLAY_COMMENT_HISTORY = 3_000;
const DEFAULT_LIVE_UPDATE_INTERVAL_MILLISECONDS = 10_000;

export interface UseLiveOverlayResult {
  threadUrl: string | null;
  comments: readonly CommentCandidate[];
  stageKey: number;
}

/** LiveThreadSessionから届くsnapshotを、OverlayStageの入力へ接続するhook。 */
export function useLiveOverlay(
  eventBus: LiveEventBus,
  options: { updateIntervalMilliseconds?: number } = {},
): UseLiveOverlayResult {
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
  const updateIntervalMilliseconds =
    options.updateIntervalMilliseconds ?? DEFAULT_LIVE_UPDATE_INTERVAL_MILLISECONDS;

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    let flowTimer: ReturnType<typeof setTimeout> | null = null;
    let currentBatchSize = 0;
    const commentQueue: CommentCandidate[] = [];

    const appendComments = (nextComments: readonly CommentCandidate[]) => {
      setComments((current) => {
        const next = [...current, ...nextComments];
        return next.length > MAX_OVERLAY_COMMENT_HISTORY
          ? next.slice(-MAX_OVERLAY_COMMENT_HISTORY)
          : next;
      });
    };

    const scheduleNextComment = () => {
      if (disposed || commentQueue.length === 0 || flowTimer) return;
      const interval = calculateNaturalCommentFlowInterval({
        queueSize: commentQueue.length,
        batchSize: currentBatchSize,
        updateIntervalMilliseconds,
      });
      flowTimer = setTimeout(() => {
        flowTimer = null;
        const count = calculateNaturalCommentFlowCount(commentQueue.length);
        appendComments(commentQueue.splice(0, count));
        scheduleNextComment();
      }, interval);
    };

    const onEvent = (event: LiveEvent) => {
      const update = controller.consume(event);
      if (!update) return;

      if (update.reset) {
        if (flowTimer) clearTimeout(flowTimer);
        flowTimer = null;
        commentQueue.length = 0;
        setThreadUrl(update.threadUrl);
        if (update.preserveVisibleComments !== true) {
          setComments([]);
          setStageKey((current) => current + 1);
        }
      }
      const batch = update.batch;
      if (!batch) return;
      const queueWasEmpty = commentQueue.length === 0;
      currentBatchSize = batch.comments.length;
      commentQueue.push(...batch.comments);
      if (queueWasEmpty && commentQueue.length > 0) {
        // 変更理由: 新着が来た反応を遅らせず、残りだけを揺らぎ付きで流す挙動を
        // EdgeLiveViewerのバッチ処理に合わせる。
        appendComments(commentQueue.splice(0, 1));
      }
      scheduleNextComment();
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
      if (flowTimer) clearTimeout(flowTimer);
      unsubscribe?.();
    };
  }, [controller, eventBus, updateIntervalMilliseconds]);

  return { threadUrl, comments, stageKey };
}
