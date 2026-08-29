import type { CommentCandidate } from "./comment-types";

/** Danmakuの初期値に合わせた、ステージ上を進むコメントの基準速度。単位はpx/sec。 */
export const DEFAULT_COMMENT_BASE_SPEED_PX_PER_SECOND = 144;

export interface CommentScheduleInput {
  comment: CommentCandidate;
  /** レンダラーが測定したコメントの幅。単位はpx。 */
  width: number;
}

export interface CommentSchedulerOptions {
  stageWidth: number;
  laneCount: number;
  baseSpeedPxPerSecond?: number;
  maxQueueSize?: number;
}

export interface ScheduledComment {
  comment: CommentCandidate;
  width: number;
  laneIndex: number;
  stageWidth: number;
  startAt: number;
  endAt: number;
  duration: number;
  speedPxPerSecond: number;
}

export interface CommentSchedulerSnapshot {
  now: number;
  active: readonly ScheduledComment[];
  pending: readonly CommentScheduleInput[];
}

/** ステージ幅と基準速度から、コメントがステージを通過する基準時間を求める。 */
export function calculateCommentDuration(stageWidth: number, baseSpeedPxPerSecond: number): number {
  assertPositiveFinite(stageWidth, "stageWidth");
  assertPositiveFinite(baseSpeedPxPerSecond, "baseSpeedPxPerSecond");
  return stageWidth / baseSpeedPxPerSecond;
}

/** コメント幅を含めた、個別コメントの実際の移動速度を求める。 */
export function calculateCommentSpeed(
  stageWidth: number,
  commentWidth: number,
  duration: number,
): number {
  assertPositiveFinite(stageWidth, "stageWidth");
  assertNonNegativeFinite(commentWidth, "commentWidth");
  assertPositiveFinite(duration, "duration");
  return (stageWidth + commentWidth) / duration;
}

/** 開始時刻と経過時刻から、コメントの左端位置を求める。 */
export function calculateCommentPosition(comment: ScheduledComment, now: number): number {
  assertFinite(now, "now");
  const elapsed = Math.min(Math.max(now - comment.startAt, 0), comment.duration);
  return comment.stageWidth - comment.speedPxPerSecond * elapsed;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  assertFinite(value, name);
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero`);
  }
}

function assertNonNegativeFinite(value: number, name: string): void {
  assertFinite(value, name);
  if (value < 0) {
    throw new RangeError(`${name} must not be negative`);
  }
}

function validateScheduleInput(input: CommentScheduleInput): void {
  assertNonNegativeFinite(input.width, "comment width");
}

/**
 * 通常スクロール用のレーン割り当てを担当する。
 * ReactやTauriを参照しないため、Storybookの手動clockと自動テストで同じ判定を使える。
 */
export class LaneAllocator {
  private readonly lanes: ScheduledComment[][];

  private readonly duration: number;

  constructor(
    private readonly stageWidth: number,
    laneCount: number,
    baseSpeedPxPerSecond: number,
  ) {
    assertPositiveFinite(stageWidth, "stageWidth");
    assertPositiveFinite(baseSpeedPxPerSecond, "baseSpeedPxPerSecond");
    if (!Number.isInteger(laneCount) || laneCount <= 0) {
      throw new RangeError("laneCount must be a positive integer");
    }
    this.duration = calculateCommentDuration(stageWidth, baseSpeedPxPerSecond);
    this.lanes = Array.from({ length: laneCount }, () => []);
  }

  /** 終了したコメントを解放し、laneが古いコメントを保持し続けないようにする。 */
  release(now: number): void {
    assertFinite(now, "now");
    for (const lane of this.lanes) {
      for (let index = lane.length - 1; index >= 0; index -= 1) {
        if (lane[index].endAt <= now) {
          lane.splice(index, 1);
        }
      }
    }
  }

  /** 現在時刻に開始できるlaneを選び、開始できなければnullを返す。 */
  allocate(input: CommentScheduleInput, now: number): ScheduledComment | null {
    validateScheduleInput(input);
    assertFinite(now, "now");
    this.release(now);

    const laneIndex = this.lanes.findIndex((lane) => this.canStartAt(lane, input.width, now));
    if (laneIndex < 0) return null;

    const scheduled = this.createScheduledComment(input, laneIndex, now);
    this.lanes[laneIndex].push(scheduled);
    return scheduled;
  }

  active(now: number): ScheduledComment[] {
    assertFinite(now, "now");
    this.release(now);
    return this.lanes.flatMap((lane) => lane);
  }

  clear(): void {
    for (const lane of this.lanes) {
      lane.length = 0;
    }
  }

  private createScheduledComment(
    input: CommentScheduleInput,
    laneIndex: number,
    startAt: number,
  ): ScheduledComment {
    return {
      comment: input.comment,
      width: input.width,
      laneIndex,
      stageWidth: this.stageWidth,
      startAt,
      endAt: startAt + this.duration,
      duration: this.duration,
      speedPxPerSecond: calculateCommentSpeed(this.stageWidth, input.width, this.duration),
    };
  }

  private canStartAt(
    lane: readonly ScheduledComment[],
    commentWidth: number,
    now: number,
  ): boolean {
    const candidateSpeed = calculateCommentSpeed(this.stageWidth, commentWidth, this.duration);
    return lane.every(
      (activeComment) =>
        calculateSafeStartAt(activeComment, candidateSpeed, this.stageWidth, this.duration) <= now,
    );
  }
}

/**
 * 既存コメントと新規コメントが同じlaneで追いつかないための最短開始時刻を求める。
 * 同じ速度以下なら入口を空け、速いコメントなら既存コメントが画面外へ出るまでの追いつきも防ぐ。
 */
function calculateSafeStartAt(
  activeComment: ScheduledComment,
  candidateSpeed: number,
  stageWidth: number,
  duration: number,
): number {
  if (candidateSpeed <= activeComment.speedPxPerSecond) {
    return activeComment.startAt + activeComment.width / activeComment.speedPxPerSecond;
  }

  return activeComment.startAt + duration - stageWidth / candidateSpeed;
}

/**
 * 新着コメントをqueueし、laneへ投入できる時刻にだけactiveへ移す。
 * 混雑時に表示中コメントの速度を変えないため、上限超過分は明示的に受け付けない。
 */
export class CommentScheduler {
  private readonly allocator: LaneAllocator;

  private readonly pendingComments: CommentScheduleInput[] = [];

  private readonly maxQueueSize: number;

  private lastNow: number | null = null;

  constructor(options: CommentSchedulerOptions) {
    this.allocator = new LaneAllocator(
      options.stageWidth,
      options.laneCount,
      options.baseSpeedPxPerSecond ?? DEFAULT_COMMENT_BASE_SPEED_PX_PER_SECOND,
    );
    this.maxQueueSize = options.maxQueueSize ?? 200;
    if (!Number.isInteger(this.maxQueueSize) || this.maxQueueSize < 0) {
      throw new RangeError("maxQueueSize must be a non-negative integer");
    }
  }

  enqueue(input: CommentScheduleInput): boolean {
    validateScheduleInput(input);
    if (this.pendingComments.length >= this.maxQueueSize) return false;
    this.pendingComments.push(input);
    return true;
  }

  /** monotonicな時刻でだけ進め、同じ時刻の呼び出しは安全に繰り返せるようにする。 */
  advance(now: number): CommentSchedulerSnapshot {
    assertFinite(now, "now");
    if (this.lastNow !== null && now < this.lastNow) {
      throw new RangeError("scheduler time must not move backwards");
    }
    this.lastNow = now;

    while (this.pendingComments.length > 0) {
      const nextComment = this.pendingComments[0];
      const scheduled = this.allocator.allocate(nextComment, now);
      if (!scheduled) break;
      this.pendingComments.shift();
    }

    return {
      now,
      active: this.allocator.active(now),
      pending: [...this.pendingComments],
    };
  }

  clear(): void {
    this.pendingComments.length = 0;
    this.allocator.clear();
    this.lastNow = null;
  }
}
