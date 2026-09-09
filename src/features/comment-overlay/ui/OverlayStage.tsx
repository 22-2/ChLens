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

/** 基準サイズに対する縦横の短い側を使い、縦横比が変わっても表示物を一様に拡縮する。 */
export function calculateOverlayDisplayScale(
  width: number,
  height: number,
  referenceWidth: number,
  referenceHeight: number,
): number {
  if (referenceWidth <= 0 || referenceHeight <= 0) return 1;
  return Math.max(0.01, Math.min(width / referenceWidth, height / referenceHeight));
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
  fontFamily?: string;
  fontWeight?: number;
  fontColor?: string;
  shadowSize?: number;
  shadowColor?: string;
  shadowDirections?: readonly ("top-left" | "top-right" | "bottom-left" | "bottom-right")[];
  commentOpacity?: number;
  backgroundColor?: string;
  playing?: boolean;
  fitToContainer?: boolean;
  scaleToContainer?: boolean;
  scaleReferenceWidth?: number;
  scaleReferenceHeight?: number;
  interactive?: boolean;
  showCommentInfo?: boolean;
  estimateWidth?: (comment: CommentCandidate, fontSize: number) => number;
  onQueueOverflow?: (comment: CommentCandidate) => void;
  onCommentClick?: (comment: CommentCandidate) => void;
  className?: string;
}

/** DOMを測定する前のfixtureでも同じ速度モデルを確認できる幅の近似値を作る。 */
export function estimateCommentWidth(comment: CommentCandidate, fontSize: number): number {
  // 変更理由: 表示は一行へ正規化するため、改行ごとの最大幅ではなく連結後の幅を
  // 使わないと、長いコメントが後続レスへ追いついて横方向に重なる。
  const singleLineText = comment.text.replace(/[\r\n]+/g, " ");
  const longestLineLength = Math.max(Array.from(singleLineText).length, 1);
  return longestLineLength * fontSize * 0.95 + fontSize;
}

/** 改行を空白へ変換し、コメントの幅計算と実際の一行表示を一致させる。 */
export function normalizeCommentOverlayText(text: string): string {
  return text.replace(/[\r\n]+/g, " ");
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
  fontFamily = '"Segoe UI", sans-serif',
  fontWeight = 600,
  fontColor = "#f4f7fb",
  shadowSize = 1,
  shadowColor = "#07101d",
  shadowDirections = ["top-left", "top-right", "bottom-left", "bottom-right"],
  commentOpacity = DEFAULT_COMMENT_OPACITY,
  backgroundColor = "#172235",
  playing = true,
  fitToContainer = false,
  scaleToContainer = false,
  scaleReferenceWidth = stageWidth,
  scaleReferenceHeight = stageHeight,
  interactive = true,
  showCommentInfo = true,
  estimateWidth = estimateCommentWidth,
  onQueueOverflow,
  onCommentClick,
  className,
}: OverlayStageProps) {
  const baseLaneHeight = laneHeightProp ?? calculateCommentLaneHeight(fontSize);
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
  const displayScale = scaleToContainer
    ? calculateOverlayDisplayScale(
        effectiveStageWidth,
        effectiveStageHeight,
        scaleReferenceWidth,
        scaleReferenceHeight,
      )
    : 1;
  // 変更理由: Tauriの実ウィンドウだけサイズが変わっても、文字とlaneを同じ倍率で
  // 追従させれば、Storybookとの差やコメント同士の重なりを防げる。
  const effectiveFontSize = Math.max(1, Math.round(fontSize * displayScale));
  const laneHeight = Math.max(1, Math.round(baseLaneHeight * displayScale));
  const effectiveShadowSize = Math.max(0, Math.round(shadowSize * displayScale));
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
        stageWidth,
        stageHeight: Math.max(
          baseLaneHeight,
          stageHeight - requestedTopPadding - requestedBottomPadding,
        ),
        laneHeight: baseLaneHeight,
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
      baseLaneHeight,
      maxActiveCount,
      maxLaneCount,
      maxQueueSize,
      requestedBottomPadding,
      requestedTopPadding,
      stageHeight,
      stageWidth,
    ],
  );
  const [snapshot, setSnapshot] = useState<CommentSchedulerSnapshot>(() => scheduler.advance(0));
  const snapshotRef = useRef(snapshot);
  const schedulerRef = useRef(scheduler);
  const seenResponseNumbers = useRef(new Set<number>());
  const logicalTime = useRef(0);
  const previousFrameTime = useRef<number | null>(null);
  const layoutRef = useRef<{
    scheduler: CommentScheduler;
    width: number;
    height: number;
    laneHeight: number;
    fontSize: number;
  } | null>(null);

  useLayoutEffect(() => {
    const currentLayout = layoutRef.current;
    if (
      currentLayout?.scheduler === scheduler &&
      currentLayout.width === effectiveStageWidth &&
      currentLayout.height === schedulableStageHeight &&
      currentLayout.laneHeight === laneHeight &&
      currentLayout.fontSize === effectiveFontSize
    ) {
      return;
    }

    layoutRef.current = {
      scheduler,
      width: effectiveStageWidth,
      height: schedulableStageHeight,
      laneHeight,
      fontSize: effectiveFontSize,
    };
    const nextSnapshot = scheduler.resizeLayout(
      {
        stageWidth: effectiveStageWidth,
        stageHeight: schedulableStageHeight,
        laneHeight,
        maxLaneCount,
        durationSeconds,
        baseSpeedPxPerSecond,
      },
      logicalTime.current,
      (comment) => estimateWidth(comment, effectiveFontSize),
    );
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
  }, [
    baseSpeedPxPerSecond,
    durationSeconds,
    effectiveFontSize,
    effectiveStageWidth,
    estimateWidth,
    laneHeight,
    maxLaneCount,
    schedulableStageHeight,
    scheduler,
  ]);

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

      const displayComment = {
        ...comment,
        text: normalizeCommentOverlayText(comment.text),
      };
      const width = estimateWidth(displayComment, effectiveFontSize);
      const result = scheduler.enqueue({ comment: displayComment, width });
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
  }, [comments, effectiveFontSize, estimateWidth, onQueueOverflow, scheduler]);

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
    color: fontColor,
    fontFamily,
  };
  const shadowOffsets = {
    "top-left": `-${effectiveShadowSize}px -${effectiveShadowSize}px 0 ${shadowColor}`,
    "top-right": `${effectiveShadowSize}px -${effectiveShadowSize}px 0 ${shadowColor}`,
    "bottom-left": `-${effectiveShadowSize}px ${effectiveShadowSize}px 0 ${shadowColor}`,
    "bottom-right": `${effectiveShadowSize}px ${effectiveShadowSize}px 0 ${shadowColor}`,
  } as const;
  // 変更理由: EdgeLiveViewerでは影の向きを個別指定できるため、選ばれた方向だけをCSSへ渡す。
  const textShadow =
    effectiveShadowSize > 0
      ? shadowDirections.map((direction) => shadowOffsets[direction]).join(", ")
      : "none";
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
          fontSize: `${effectiveFontSize}px`,
          fontWeight,
          textShadow,
          opacity: commentOpacity,
          animationDuration: `${scheduledComment.duration}s`,
          animationDelay: `${-scheduledComment.initialProgress * scheduledComment.duration}s`,
          animationPlayState:
            playing && !scheduledComment.paused ? ("running" as const) : ("paused" as const),
          "--comment-exit-translate": `-${scheduledComment.stageWidth + scheduledComment.width}px`,
        } as CSSProperties;
        const { comment } = scheduledComment;
        const commentInfoId = `comment-overlay-stage__info-${comment.responseNumber}`;

        return (
          <div
            key={`${comment.responseNumber}-${scheduledComment.startAt}-${scheduledComment.layoutRevision}`}
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
