import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  calculateCommentPosition,
  CommentScheduler,
  type CommentSchedulerSnapshot,
} from "../domain";
import type { CommentCandidate } from "../domain/comment-types";
import "./OverlayStage.css";

const DEFAULT_STAGE_WIDTH = 800;
const DEFAULT_STAGE_HEIGHT = 240;
const DEFAULT_LANE_COUNT = 6;
const DEFAULT_LANE_HEIGHT = 32;
const DEFAULT_FONT_SIZE = 20;
const DEFAULT_COMMENT_OPACITY = 0.95;
const DEFAULT_MAX_QUEUE_SIZE = 200;

export interface OverlayStageProps {
  comments: readonly CommentCandidate[];
  stageWidth?: number;
  stageHeight?: number;
  laneCount?: number;
  laneHeight?: number;
  baseSpeedPxPerSecond?: number;
  maxQueueSize?: number;
  fontSize?: number;
  commentOpacity?: number;
  backgroundColor?: string;
  playing?: boolean;
  fitToContainer?: boolean;
  estimateWidth?: (comment: CommentCandidate, fontSize: number) => number;
  onQueueOverflow?: (comment: CommentCandidate) => void;
  className?: string;
}

/** DOMを測定する前のfixtureでも同じ速度モデルを確認できる幅の近似値を作る。 */
export function estimateCommentWidth(comment: CommentCandidate, fontSize: number): number {
  const longestLineLength = Math.max(
    ...comment.text.split("\n").map((line) => Array.from(line).length),
    1,
  );
  return longestLineLength * fontSize * 0.95 + fontSize;
}

export function OverlayStage({
  comments,
  stageWidth = DEFAULT_STAGE_WIDTH,
  stageHeight = DEFAULT_STAGE_HEIGHT,
  laneCount = DEFAULT_LANE_COUNT,
  laneHeight = DEFAULT_LANE_HEIGHT,
  baseSpeedPxPerSecond,
  maxQueueSize = DEFAULT_MAX_QUEUE_SIZE,
  fontSize = DEFAULT_FONT_SIZE,
  commentOpacity = DEFAULT_COMMENT_OPACITY,
  backgroundColor = "#172235",
  playing = true,
  fitToContainer = false,
  estimateWidth = estimateCommentWidth,
  onQueueOverflow,
  className,
}: OverlayStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const effectiveStageWidth = fitToContainer ? (containerSize?.width ?? stageWidth) : stageWidth;

  useLayoutEffect(() => {
    if (!fitToContainer || typeof ResizeObserver === "undefined") return;

    const stageElement = stageRef.current;
    if (!stageElement) return;

    const updateSize = (width: number, height: number) => {
      // 変更理由: flexレイアウトが確定する前の0px測定を採用すると、stageWidthが
      // 1pxになってコメントが一瞬で画面外へ出るため、実寸が得られるまでfallbackを使う。
      if (width <= 0 || height <= 0) return;

      const nextSize = {
        width: Math.round(width),
        height: Math.round(height),
      };
      setContainerSize((currentSize) =>
        currentSize?.width === nextSize.width && currentSize.height === nextSize.height
          ? currentSize
          : nextSize,
      );
    };
    const initialRect = stageElement.getBoundingClientRect();
    updateSize(initialRect.width, initialRect.height);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(stageElement);
    return () => observer.disconnect();
  }, [fitToContainer]);

  const scheduler = useMemo(
    () =>
      new CommentScheduler({
        stageWidth: effectiveStageWidth,
        laneCount,
        baseSpeedPxPerSecond,
        maxQueueSize,
      }),
    [baseSpeedPxPerSecond, effectiveStageWidth, laneCount, maxQueueSize],
  );
  const [snapshot, setSnapshot] = useState<CommentSchedulerSnapshot>(() => scheduler.advance(0));
  const seenResponseNumbers = useRef(new Set<number>());
  const logicalTime = useRef(0);
  const previousFrameTime = useRef<number | null>(null);

  useEffect(() => {
    // 変更理由: Controlsでステージ設定を変えたとき、旧ステージのlaneと時刻を
    // 新しい寸法へ持ち越すと表示位置と衝突判定が一致しなくなるため、fixtureを再baselineする。
    seenResponseNumbers.current.clear();
    logicalTime.current = 0;
    previousFrameTime.current = null;
    setSnapshot(scheduler.advance(0));
  }, [scheduler]);

  useEffect(() => {
    for (const comment of comments) {
      if (seenResponseNumbers.current.has(comment.responseNumber)) continue;

      const width = estimateWidth(comment, fontSize);
      if (!scheduler.enqueue({ comment, width })) {
        // 変更理由: queueが満杯のときに同じレスを毎回再投入すると、入力更新のたびに
        // 古いレスがqueueを奪うため、上限超過分は明示的にskipして一度だけ通知する。
        onQueueOverflow?.(comment);
      }
      seenResponseNumbers.current.add(comment.responseNumber);
    }
  }, [comments, estimateWidth, fontSize, onQueueOverflow, scheduler]);

  useEffect(() => {
    if (!playing) {
      previousFrameTime.current = null;
      return;
    }

    let frameId = 0;
    const renderFrame = (frameTime: number) => {
      const previousTime = previousFrameTime.current;
      if (previousTime !== null) {
        logicalTime.current += Math.max(frameTime - previousTime, 0) / 1000;
      }
      previousFrameTime.current = frameTime;
      setSnapshot(scheduler.advance(logicalTime.current));
      frameId = requestAnimationFrame(renderFrame);
    };

    frameId = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(frameId);
      previousFrameTime.current = null;
    };
  }, [playing, scheduler]);

  const stageStyle: CSSProperties = {
    width: fitToContainer ? "100%" : `${stageWidth}px`,
    height: fitToContainer ? "100%" : `${stageHeight}px`,
    backgroundColor,
  };
  const stageClassName = ["comment-overlay-stage", className].filter(Boolean).join(" ");

  return (
    <div
      className={stageClassName}
      ref={stageRef}
      data-testid="comment-overlay-stage"
      data-active-count={snapshot.active.length}
      data-pending-count={snapshot.pending.length}
      role="log"
      aria-label="コメントオーバーレイ"
      style={stageStyle}
    >
      {snapshot.active.map((scheduledComment) => {
        const position = calculateCommentPosition(scheduledComment, snapshot.now);
        const commentStyle: CSSProperties = {
          top: `${scheduledComment.laneIndex * laneHeight}px`,
          fontSize: `${fontSize}px`,
          opacity: commentOpacity,
          transform: `translate3d(${position}px, 0, 0)`,
        };
        const { comment } = scheduledComment;

        return (
          <div
            key={`${comment.responseNumber}-${scheduledComment.startAt}`}
            className="comment-overlay-stage__comment"
            data-response-number={comment.responseNumber}
            data-lane-index={scheduledComment.laneIndex}
            style={commentStyle}
            aria-label={`レス${comment.responseNumber}: ${comment.text}`}
          >
            {comment.text}
          </div>
        );
      })}
    </div>
  );
}
