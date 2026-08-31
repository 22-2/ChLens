import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  CommentScheduler,
  DEFAULT_COMMENT_BACKLOG_POLICY,
  DEFAULT_COMMENT_COLLISION_MODE,
  DEFAULT_MAX_LANE_COUNT,
  DEFAULT_MAX_QUEUE_SIZE,
  DEFAULT_MAX_ACTIVE_COUNT,
  type CommentBacklogPolicy,
  type CommentCollisionMode,
  type CommentSchedulerSnapshot,
} from "../domain";
import type { CommentCandidate } from "../domain/comment-types";
import "./OverlayStage.css";

const DEFAULT_STAGE_WIDTH = 800;
const DEFAULT_STAGE_HEIGHT = 240;
const DEFAULT_FONT_SIZE = 20;
const DEFAULT_COMMENT_OPACITY = 0.95;
export const DEFAULT_COMMENT_HISTORY_LIMIT = 3_000;

/** CSSのline-heightと行間を揃え、文字サイズ変更後もレスが上下から切れない高さにする。 */
export function calculateCommentLaneHeight(fontSize: number): number {
  return Math.max(1, Math.ceil(fontSize * 1.2 + 4));
}

export interface OverlayStageProps {
  comments: readonly CommentCandidate[];
  stageWidth?: number;
  stageHeight?: number;
  laneHeight?: number;
  maxLaneCount?: number;
  durationSeconds?: number;
  baseSpeedPxPerSecond?: number;
  topPadding?: number;
  bottomPadding?: number;
  maxQueueSize?: number;
  collisionMode?: CommentCollisionMode;
  backlogPolicy?: CommentBacklogPolicy;
  maxActiveCount?: number;
  fontSize?: number;
  commentOpacity?: number;
  backgroundColor?: string;
  playing?: boolean;
  fitToContainer?: boolean;
  interactive?: boolean;
  showCommentInfo?: boolean;
  estimateWidth?: (comment: CommentCandidate, fontSize: number) => number;
  onQueueOverflow?: (comment: CommentCandidate) => void;
  onCommentClick?: (comment: CommentCandidate) => void;
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
  laneHeight: laneHeightProp,
  maxLaneCount = DEFAULT_MAX_LANE_COUNT,
  durationSeconds,
  baseSpeedPxPerSecond,
  topPadding = 0,
  bottomPadding = 0,
  maxQueueSize = DEFAULT_MAX_QUEUE_SIZE,
  collisionMode = DEFAULT_COMMENT_COLLISION_MODE,
  backlogPolicy = DEFAULT_COMMENT_BACKLOG_POLICY,
  maxActiveCount = DEFAULT_MAX_ACTIVE_COUNT,
  fontSize = DEFAULT_FONT_SIZE,
  commentOpacity = DEFAULT_COMMENT_OPACITY,
  backgroundColor = "#172235",
  playing = true,
  fitToContainer = false,
  interactive = true,
  showCommentInfo = true,
  estimateWidth = estimateCommentWidth,
  onQueueOverflow,
  onCommentClick,
  className,
}: OverlayStageProps) {
  const laneHeight = laneHeightProp ?? calculateCommentLaneHeight(fontSize);
  const requestedTopPadding = Math.max(0, topPadding);
  const requestedBottomPadding = Math.max(0, bottomPadding);
  const stageRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const effectiveStageWidth = fitToContainer ? (containerSize?.width ?? stageWidth) : stageWidth;
  const effectiveStageHeight = fitToContainer
    ? (containerSize?.height ?? stageHeight)
    : stageHeight;
  const effectiveTopPadding = Math.min(
    requestedTopPadding,
    Math.max(0, effectiveStageHeight - laneHeight),
  );
  const effectiveBottomPadding = Math.min(
    requestedBottomPadding,
    Math.max(0, effectiveStageHeight - effectiveTopPadding - laneHeight),
  );
  const schedulableStageHeight = Math.max(
    laneHeight,
    effectiveStageHeight - effectiveTopPadding - effectiveBottomPadding,
  );

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
        stageHeight: schedulableStageHeight,
        laneHeight,
        maxLaneCount,
        durationSeconds,
        baseSpeedPxPerSecond,
        maxQueueSize,
        collisionMode,
        backlogPolicy,
        maxActiveCount,
      }),
    [
      backlogPolicy,
      baseSpeedPxPerSecond,
      collisionMode,
      durationSeconds,
      effectiveStageWidth,
      laneHeight,
      maxActiveCount,
      maxLaneCount,
      maxQueueSize,
      schedulableStageHeight,
    ],
  );
  const [snapshot, setSnapshot] = useState<CommentSchedulerSnapshot>(() => scheduler.advance(0));
  const snapshotRef = useRef(snapshot);
  const schedulerRef = useRef(scheduler);
  const seenResponseNumbers = useRef(new Set<number>());
  const logicalTime = useRef(0);
  const previousFrameTime = useRef<number | null>(null);

  useEffect(() => {
    // 変更理由: Controlsでステージ設定を変えたとき、旧ステージのlaneと時刻を
    // 新しい寸法へ持ち越すと表示位置と衝突判定が一致しなくなるため、fixtureを再baselineする。
    seenResponseNumbers.current.clear();
    logicalTime.current = 0;
    previousFrameTime.current = null;
    const nextSnapshot = scheduler.advance(0);
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
  }, [scheduler]);

  useEffect(() => {
    // 変更理由: 親が直近の履歴だけを保持している間、入力から外れたレス番号も
    // dedupe Setに残すと長時間実況でSetだけが無制限に増えるため、現在の入力範囲に揃える。
    const currentResponseNumbers = new Set(comments.map((comment) => comment.responseNumber));
    for (const responseNumber of seenResponseNumbers.current) {
      if (!currentResponseNumbers.has(responseNumber)) {
        seenResponseNumbers.current.delete(responseNumber);
      }
    }

    for (const comment of comments) {
      if (seenResponseNumbers.current.has(comment.responseNumber)) continue;

      const width = estimateWidth(comment, fontSize);
      const result = scheduler.enqueue({ comment, width });
      if (result.dropped) {
        // 変更理由: queueが満杯のときに同じレスを毎回再投入すると、入力更新のたびに
        // 古いレスがqueueを奪うため、最古の待機レスをskipして一度だけ通知する。
        onQueueOverflow?.(result.dropped.comment);
      } else if (!result.accepted) {
        onQueueOverflow?.(comment);
      }
      seenResponseNumbers.current.add(comment.responseNumber);
    }

    if (schedulerRef.current !== scheduler) {
      // 変更理由: 文字サイズ変更でlane高が変わるとschedulerも再生成されるため、
      // 次のrequestAnimationFrameを待たずに再投入したコメントをDOMへ反映する。
      const nextSnapshot = scheduler.advance(logicalTime.current);
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      schedulerRef.current = scheduler;
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
      const nextSnapshot = scheduler.advance(logicalTime.current);
      // 変更理由: 移動はCSS animationが担当するため、active/pendingの構成が変わらない
      // frameではReactを再描画しない。終了・投入時だけDOM一覧を更新して弾幕数に応じた
      // React renderを避ける。
      if (!isSameSnapshot(snapshotRef.current, nextSnapshot)) {
        snapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
      }
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
  const stageClassName = [
    "comment-overlay-stage",
    interactive ? "comment-overlay-stage--interactive" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const pauseComment = (responseNumber: number): void => {
    const now = logicalTime.current;
    if (scheduler.pause(responseNumber, now)) {
      const nextSnapshot = scheduler.advance(now);
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
    }
  };

  const resumeComment = (responseNumber: number): void => {
    const now = logicalTime.current;
    if (scheduler.resume(responseNumber, now)) {
      const nextSnapshot = scheduler.advance(now);
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
    }
  };

  return (
    <div
      className={stageClassName}
      ref={stageRef}
      data-testid="comment-overlay-stage"
      data-active-count={snapshot.active.length}
      data-pending-count={snapshot.pending.length}
      data-collision-mode={collisionMode}
      role="log"
      aria-label="コメントオーバーレイ"
      style={stageStyle}
    >
      {snapshot.active.map((scheduledComment) => {
        const commentStyle = {
          top: `${effectiveTopPadding + scheduledComment.laneIndex * laneHeight}px`,
          left: `${scheduledComment.stageWidth}px`,
          fontSize: `${fontSize}px`,
          opacity: commentOpacity,
          animationDuration: `${scheduledComment.duration}s`,
          animationPlayState:
            playing && !scheduledComment.paused ? ("running" as const) : ("paused" as const),
          "--comment-exit-translate": `-${scheduledComment.stageWidth + scheduledComment.width}px`,
        } as CSSProperties;
        const { comment } = scheduledComment;
        const commentInfoId = `comment-overlay-stage__info-${comment.responseNumber}`;

        return (
          <div
            key={`${comment.responseNumber}-${scheduledComment.startAt}`}
            className="comment-overlay-stage__comment"
            data-response-number={comment.responseNumber}
            data-lane-index={scheduledComment.laneIndex}
            data-paused={scheduledComment.paused}
            aria-describedby={
              interactive && showCommentInfo && scheduledComment.paused ? commentInfoId : undefined
            }
            role={interactive ? "group" : undefined}
            tabIndex={interactive ? 0 : -1}
            style={commentStyle}
            aria-label={`レス${comment.responseNumber}: ${comment.text}`}
            onMouseEnter={interactive ? () => pauseComment(comment.responseNumber) : undefined}
            onMouseLeave={interactive ? () => resumeComment(comment.responseNumber) : undefined}
            onFocus={interactive ? () => pauseComment(comment.responseNumber) : undefined}
            onBlur={interactive ? () => resumeComment(comment.responseNumber) : undefined}
            onClick={onCommentClick ? () => onCommentClick(comment) : undefined}
          >
            {comment.text}
            {interactive && showCommentInfo && scheduledComment.paused ? (
              <span
                id={commentInfoId}
                className="comment-overlay-stage__comment-info"
                role="tooltip"
              >
                <strong>レス{comment.responseNumber}</strong>
                <span>{comment.author}</span>
                {comment.id ? <span>ID: {comment.id}</span> : null}
                {comment.date ? <time>{comment.date}</time> : null}
                <span className="comment-overlay-stage__comment-info-text">{comment.text}</span>
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function isSameSnapshot(
  current: CommentSchedulerSnapshot,
  next: CommentSchedulerSnapshot,
): boolean {
  if (current.active.length !== next.active.length) return false;
  if (current.pending.length !== next.pending.length) return false;
  return (
    current.active.every((comment, index) => comment === next.active[index]) &&
    current.pending.every((input, index) => input === next.pending[index])
  );
}
