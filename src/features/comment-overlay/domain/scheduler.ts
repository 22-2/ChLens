import type { CommentCandidate } from "./comment-types";

/** DPlayerデモのspeedRate:0.5を900px幅で再現する、ステージ上を進む基準速度。単位はpx/sec。 */
export const DEFAULT_COMMENT_BASE_SPEED_PX_PER_SECOND = 90;

/** 高さが大きいOverlayでもDOMノードが無制限に増えないようにするレーン容量の上限。 */
export const DEFAULT_MAX_LANE_COUNT = 24;

/** ライブ感を保ち、古い待機レスが長時間残らないようにする待機queueの初期上限。 */
export const DEFAULT_MAX_QUEUE_SIZE = 64;

/** DPlayerのデモのように、満杯でも新着を待たせず表示する既定衝突方針。 */
export const DEFAULT_COMMENT_COLLISION_MODE: CommentCollisionMode = "adaptive";

/** ライブ表示では衝突待ちを作らず、投入できないレスをその場で破棄する。 */
export const DEFAULT_COMMENT_BACKLOG_POLICY: CommentBacklogPolicy = "drop";

/** DPlayerデモのmaximum:3000に寄せつつ、DOMが無制限に増えないようにする上限。 */
export const DEFAULT_MAX_ACTIVE_COUNT = 3000;

export type CommentCollisionMode = "strict" | "adaptive" | "none";

export type CommentBacklogPolicy = "queue" | "drop";

export interface CommentScheduleInput {
  comment: CommentCandidate;
  /** レンダラーが測定したコメントの幅。単位はpx。 */
  width: number;
}

export interface CommentSchedulerOptions {
  stageWidth: number;
  stageHeight: number;
  laneHeight: number;
  maxLaneCount?: number;
  baseSpeedPxPerSecond?: number;
  maxQueueSize?: number;
  collisionMode?: CommentCollisionMode;
  backlogPolicy?: CommentBacklogPolicy;
  maxActiveCount?: number;
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
  paused: boolean;
  pausedAt: number | null;
  pausedDuration: number;
}

export interface CommentSchedulerSnapshot {
  now: number;
  active: readonly ScheduledComment[];
  pending: readonly CommentScheduleInput[];
}

export interface CommentEnqueueResult {
  accepted: boolean;
  dropped: CommentScheduleInput | null;
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
  const movementNow = comment.pausedAt ?? now;
  const elapsed = Math.min(
    Math.max(movementNow - comment.startAt - comment.pausedDuration, 0),
    comment.duration,
  );
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

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

/** ステージ高さから、allocatorが作成できるレーン容量を求める。 */
export function calculateLaneCapacity(
  stageHeight: number,
  laneHeight: number,
  maxLaneCount = DEFAULT_MAX_LANE_COUNT,
): number {
  assertPositiveFinite(stageHeight, "stageHeight");
  assertPositiveFinite(laneHeight, "laneHeight");
  assertPositiveInteger(maxLaneCount, "maxLaneCount");
  return Math.min(Math.max(Math.floor(stageHeight / laneHeight), 1), maxLaneCount);
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

  private fallbackLaneIndex = 0;

  constructor(
    private readonly stageWidth: number,
    private readonly maxLaneCount: number,
    baseSpeedPxPerSecond: number,
  ) {
    assertPositiveFinite(stageWidth, "stageWidth");
    assertPositiveFinite(baseSpeedPxPerSecond, "baseSpeedPxPerSecond");
    assertPositiveInteger(maxLaneCount, "maxLaneCount");
    this.duration = calculateCommentDuration(stageWidth, baseSpeedPxPerSecond);
    this.lanes = [];
  }

  /** 終了したコメントを解放し、laneが古いコメントを保持し続けないようにする。 */
  release(now: number): void {
    assertFinite(now, "now");
    for (const lane of this.lanes) {
      for (let index = lane.length - 1; index >= 0; index -= 1) {
        // 変更理由: hover中のコメントは画面上で停止しているため、元のendAtだけで
        // 解放すると、停止したコメントが消える前にlaneへ後続レスが侵入してしまう。
        if (!lane[index].paused && lane[index].endAt <= now) {
          lane.splice(index, 1);
        }
      }
    }
  }

  /** 現在時刻に開始できるlaneを選び、必要なときだけ新しいlaneを作る。 */
  allocate(
    input: CommentScheduleInput,
    now: number,
    collisionMode: CommentCollisionMode = "strict",
  ): ScheduledComment | null {
    validateScheduleInput(input);
    assertFinite(now, "now");
    this.release(now);

    let laneIndex =
      collisionMode === "none"
        ? -1
        : this.lanes.findIndex((lane) => this.canStartAt(lane, input.width, now));
    if (laneIndex < 0) {
      if (this.lanes.length < this.maxLaneCount) {
        // 変更理由: 空のlaneは衝突判定の対象にならないため、容量内では先に
        // 新しいlaneを作る。全laneが埋まったときだけstrictとadaptiveを分岐する。
        laneIndex = this.lanes.length;
        this.lanes.push([]);
      } else {
        if (collisionMode === "strict") return null;

        // 変更理由: ライブ実況では衝突回避のために新着を待たせると、表示が過去へ遅れる。
        // まず容量内のlaneを使い切り、その後は循環して限定的な重なりを許可する。
        laneIndex = this.getFallbackLaneIndex();
      }
    }

    const scheduled = this.createScheduledComment(input, laneIndex, now);
    this.lanes[laneIndex].push(scheduled);
    return scheduled;
  }

  active(now: number): ScheduledComment[] {
    assertFinite(now, "now");
    this.release(now);
    return this.lanes.flatMap((lane) => lane);
  }

  activeCount(now: number): number {
    assertFinite(now, "now");
    this.release(now);
    return this.lanes.reduce((count, lane) => count + lane.length, 0);
  }

  clear(): void {
    for (const lane of this.lanes) {
      lane.length = 0;
    }
    this.fallbackLaneIndex = 0;
  }

  pause(responseNumber: number, now: number): boolean {
    assertFinite(now, "now");
    this.release(now);
    const scheduled = this.find(responseNumber);
    if (!scheduled || scheduled.paused) return false;

    scheduled.paused = true;
    scheduled.pausedAt = now;
    return true;
  }

  resume(responseNumber: number, now: number): boolean {
    assertFinite(now, "now");
    this.release(now);
    const scheduled = this.find(responseNumber);
    if (!scheduled || !scheduled.paused || scheduled.pausedAt === null) return false;

    const pausedDuration = Math.max(now - scheduled.pausedAt, 0);
    scheduled.pausedDuration += pausedDuration;
    scheduled.endAt += pausedDuration;
    scheduled.paused = false;
    scheduled.pausedAt = null;
    return true;
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
      paused: false,
      pausedAt: null,
      pausedDuration: 0,
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

  private getFallbackLaneIndex(): number {
    // 変更理由: adaptive/noneで全laneが衝突中でも、同じlaneへ集中させず画面全体へ
    // 分散することで、短時間の弾幕が一列の巨大な塊になることを防ぐ。
    if (this.lanes.length < this.maxLaneCount) {
      const laneIndex = this.lanes.length;
      this.lanes.push([]);
      return laneIndex;
    }

    const laneIndex = this.fallbackLaneIndex % this.lanes.length;
    this.fallbackLaneIndex += 1;
    return laneIndex;
  }

  private find(responseNumber: number): ScheduledComment | null {
    for (const lane of this.lanes) {
      const scheduled = lane.find(
        (candidate) => candidate.comment.responseNumber === responseNumber,
      );
      if (scheduled) return scheduled;
    }
    return null;
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
  if (activeComment.paused) return Number.POSITIVE_INFINITY;

  // 一時停止時間を仮想的な開始時刻へ反映し、再開後も後続コメントが追いつかないようにする。
  const movementStartAt = activeComment.startAt + activeComment.pausedDuration;
  if (candidateSpeed <= activeComment.speedPxPerSecond) {
    return movementStartAt + activeComment.width / activeComment.speedPxPerSecond;
  }

  return movementStartAt + duration - stageWidth / candidateSpeed;
}

/**
 * 新着コメントをqueueし、laneへ投入できる時刻にだけactiveへ移す。
 * 混雑時に表示中コメントの速度を変えず、古いpendingが実況に遅れて残らないようにする。
 */
export class CommentScheduler {
  private readonly allocator: LaneAllocator;

  private readonly pendingComments: CommentScheduleInput[] = [];

  private readonly maxQueueSize: number;

  private readonly collisionMode: CommentCollisionMode;

  private readonly backlogPolicy: CommentBacklogPolicy;

  private readonly maxActiveCount: number;

  private lastNow: number | null = null;

  constructor(options: CommentSchedulerOptions) {
    const laneCapacity = calculateLaneCapacity(
      options.stageHeight,
      options.laneHeight,
      options.maxLaneCount,
    );
    this.allocator = new LaneAllocator(
      options.stageWidth,
      laneCapacity,
      options.baseSpeedPxPerSecond ?? DEFAULT_COMMENT_BASE_SPEED_PX_PER_SECOND,
    );
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.collisionMode = options.collisionMode ?? DEFAULT_COMMENT_COLLISION_MODE;
    this.backlogPolicy = options.backlogPolicy ?? DEFAULT_COMMENT_BACKLOG_POLICY;
    this.maxActiveCount = options.maxActiveCount ?? DEFAULT_MAX_ACTIVE_COUNT;
    if (!isCommentCollisionMode(this.collisionMode)) {
      throw new TypeError("collisionMode must be strict, adaptive, or none");
    }
    if (!isCommentBacklogPolicy(this.backlogPolicy)) {
      throw new TypeError("backlogPolicy must be queue or drop");
    }
    assertPositiveInteger(this.maxActiveCount, "maxActiveCount");
    if (!Number.isInteger(this.maxQueueSize) || this.maxQueueSize < 0) {
      throw new RangeError("maxQueueSize must be a non-negative integer");
    }
  }

  enqueue(input: CommentScheduleInput): CommentEnqueueResult {
    validateScheduleInput(input);

    if (this.collisionMode !== "strict" || this.backlogPolicy === "drop") {
      const now = this.lastNow ?? 0;
      if (this.allocator.activeCount(now) >= this.maxActiveCount) {
        return { accepted: false, dropped: input };
      }

      // 変更理由: DPlayerのlive/unlimitedに合わせ、ライブの新着はenqueue時点で
      // 表示へ移す。次のframeまでpendingに置くと、高速入力時に不要な遅延が発生する。
      const scheduled = this.allocator.allocate(input, now, this.collisionMode);
      return scheduled ? { accepted: true, dropped: null } : { accepted: false, dropped: input };
    }

    if (this.maxQueueSize === 0) {
      return { accepted: false, dropped: null };
    }

    let dropped: CommentScheduleInput | null = null;
    if (this.pendingComments.length >= this.maxQueueSize) {
      // 変更理由: ライブ入力を古い待機レスの表示待ちにしないため、queue満杯時は
      // 最古のpendingだけをskipして新着を受け入れる。activeの速度は変更しない。
      dropped = this.pendingComments.shift() ?? null;
    }
    this.pendingComments.push(input);
    return { accepted: true, dropped };
  }

  pause(responseNumber: number, now: number): boolean {
    this.assertAndSetNow(now);
    return this.allocator.pause(responseNumber, now);
  }

  resume(responseNumber: number, now: number): boolean {
    this.assertAndSetNow(now);
    return this.allocator.resume(responseNumber, now);
  }

  /** monotonicな時刻でだけ進め、同じ時刻の呼び出しは安全に繰り返せるようにする。 */
  advance(now: number): CommentSchedulerSnapshot {
    this.assertAndSetNow(now);

    while (this.pendingComments.length > 0) {
      const nextComment = this.pendingComments[0];
      if (this.allocator.activeCount(now) >= this.maxActiveCount) break;
      const scheduled = this.allocator.allocate(nextComment, now, this.collisionMode);
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

  private assertAndSetNow(now: number): void {
    assertFinite(now, "now");
    if (this.lastNow !== null && now < this.lastNow) {
      throw new RangeError("scheduler time must not move backwards");
    }
    this.lastNow = now;
  }
}

function isCommentCollisionMode(value: string): value is CommentCollisionMode {
  return value === "strict" || value === "adaptive" || value === "none";
}

function isCommentBacklogPolicy(value: string): value is CommentBacklogPolicy {
  return value === "queue" || value === "drop";
}
