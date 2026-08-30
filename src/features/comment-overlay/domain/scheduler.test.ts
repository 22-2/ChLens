import { describe, expect, it } from "vite-plus/test";
import type { CommentCandidate } from "./comment-types";
import {
  calculateCommentDuration,
  calculateLaneCapacity,
  calculateCommentPosition,
  calculateCommentSpeed,
  CommentScheduler,
  DEFAULT_COMMENT_BASE_SPEED_PX_PER_SECOND,
} from "./scheduler";

function createComment(responseNumber: number, text = `レス${responseNumber}`): CommentCandidate {
  return {
    responseNumber,
    text,
    author: "名無し",
  };
}

function createInput(responseNumber: number, width: number) {
  return {
    comment: createComment(responseNumber),
    width,
  };
}

function createScheduler(
  options: Partial<ConstructorParameters<typeof CommentScheduler>[0]> = {},
): CommentScheduler {
  return new CommentScheduler({
    stageWidth: 600,
    stageHeight: 32,
    laneHeight: 32,
    baseSpeedPxPerSecond: 144,
    collisionMode: "strict",
    backlogPolicy: "queue",
    ...options,
  });
}

describe("コメントの速度モデル", () => {
  it("ステージ幅と基準速度から通過時間を求める", () => {
    const duration = calculateCommentDuration(600, DEFAULT_COMMENT_BASE_SPEED_PX_PER_SECOND);

    expect(duration).toBeCloseTo(600 / 90);
  });

  it("コメント幅を含めた実速度を求める", () => {
    const duration = calculateCommentDuration(600, 144);

    expect(calculateCommentSpeed(600, 120, duration)).toBeCloseTo(172.8);
  });
});

describe("コメントのレーン容量", () => {
  it("ステージ高さと行高から容量を求め、上限を適用する", () => {
    expect(calculateLaneCapacity(240, 32)).toBe(7);
    expect(calculateLaneCapacity(240, 32, 4)).toBe(4);
    expect(calculateLaneCapacity(16, 32)).toBe(1);
  });

  it("不正なレーン設定を拒否する", () => {
    expect(() => calculateLaneCapacity(240, 0)).toThrow("laneHeight");
    expect(() => calculateLaneCapacity(240, 32, 0)).toThrow("maxLaneCount");
  });
});

describe("CommentScheduler", () => {
  it("コメントをqueueしてからlaneへ投入し、終了時に解放する", () => {
    const scheduler = createScheduler();
    const input = createInput(1, 120);
    const duration = calculateCommentDuration(600, 144);

    expect(scheduler.enqueue(input).accepted).toBe(true);
    expect(scheduler.advance(0).active).toHaveLength(1);
    expect(scheduler.advance(duration).active).toHaveLength(0);
  });

  it("開始位置と終了位置がステージ幅とコメント幅に対応する", () => {
    const scheduler = createScheduler();
    scheduler.enqueue(createInput(1, 120));
    const active = scheduler.advance(0).active[0];

    expect(calculateCommentPosition(active, 0)).toBe(600);
    expect(calculateCommentPosition(active, active.endAt)).toBe(-120);
  });

  it("同時投入されたコメントを別laneへ割り当てる", () => {
    const scheduler = createScheduler({ stageHeight: 64 });
    scheduler.enqueue(createInput(1, 120));
    scheduler.enqueue(createInput(2, 120));

    const snapshot = scheduler.advance(0);

    expect(snapshot.active.map((comment) => comment.laneIndex)).toEqual([0, 1]);
    expect(snapshot.pending).toHaveLength(0);
  });

  it("durationSeconds指定時はステージ幅が変わっても通過時間を固定する", () => {
    const scheduler = createScheduler({
      stageWidth: 1_200,
      stageHeight: 80,
      laneHeight: 40,
      durationSeconds: 6,
    });

    scheduler.enqueue(createInput(1, 240));

    expect(scheduler.advance(0).active[0]?.duration).toBe(6);
    expect(scheduler.advance(0).active[0]?.speedPxPerSecond).toBe(240);
  });

  it("必要なときだけlaneを増やし、ステージ高さの容量で止める", () => {
    const scheduler = createScheduler({ stageHeight: 96 });
    scheduler.enqueue(createInput(1, 120));
    scheduler.enqueue(createInput(2, 120));
    scheduler.enqueue(createInput(3, 120));
    scheduler.enqueue(createInput(4, 120));

    const snapshot = scheduler.advance(0);

    expect(snapshot.active.map((comment) => comment.laneIndex)).toEqual([0, 1, 2]);
    expect(snapshot.pending.map((input) => input.comment.responseNumber)).toEqual([4]);
  });

  it("同じlaneでは入口が空くまで次のコメントを待たせる", () => {
    const scheduler = createScheduler();
    scheduler.enqueue(createInput(1, 120));
    scheduler.advance(0);
    scheduler.enqueue(createInput(2, 120));

    const beforeEntryIsFree = scheduler.advance(0.5);
    const afterEntryIsFree = scheduler.advance(0.8);

    expect(beforeEntryIsFree.active).toHaveLength(1);
    expect(beforeEntryIsFree.pending).toHaveLength(1);
    expect(afterEntryIsFree.active).toHaveLength(2);
    expect(afterEntryIsFree.pending).toHaveLength(0);
  });

  it("新しい長文が既存コメントへ追いつかない時刻まで待たせる", () => {
    const scheduler = createScheduler();
    const duration = calculateCommentDuration(600, 144);
    const longCommentSpeed = calculateCommentSpeed(600, 300, duration);
    const safeStartAt = duration - 600 / longCommentSpeed;

    scheduler.enqueue(createInput(1, 20));
    scheduler.advance(0);
    scheduler.enqueue(createInput(2, 300));

    expect(scheduler.advance(safeStartAt - 0.01).pending).toHaveLength(1);
    expect(scheduler.advance(safeStartAt).pending).toHaveLength(0);
  });

  it("adaptiveではlaneが衝突中でも新着を即時表示する", () => {
    const scheduler = createScheduler({
      collisionMode: "adaptive",
      backlogPolicy: "drop",
    });
    scheduler.enqueue(createInput(1, 120));
    scheduler.enqueue(createInput(2, 120));

    const snapshot = scheduler.advance(0);

    expect(snapshot.active).toHaveLength(2);
    expect(snapshot.active.map((comment) => comment.laneIndex)).toEqual([0, 0]);
    expect(snapshot.pending).toHaveLength(0);
  });

  it("既定値はadaptiveとdropで、入力が待機queueへ残らない", () => {
    const scheduler = new CommentScheduler({
      stageWidth: 600,
      stageHeight: 32,
      laneHeight: 32,
    });

    scheduler.enqueue(createInput(1, 120));
    scheduler.enqueue(createInput(2, 120));

    const snapshot = scheduler.advance(0);

    expect(snapshot.active).toHaveLength(2);
    expect(snapshot.pending).toHaveLength(0);
  });

  it("strictとdropの組み合わせでは衝突した新着をqueueへ残さない", () => {
    const scheduler = createScheduler({
      collisionMode: "strict",
      backlogPolicy: "drop",
    });
    scheduler.enqueue(createInput(1, 120));

    const result = scheduler.enqueue(createInput(2, 120));

    expect(result.accepted).toBe(false);
    expect(result.dropped?.comment.responseNumber).toBe(2);
    expect(scheduler.advance(0).pending).toHaveLength(0);
  });

  it("adaptiveでもactive上限を超える新着はその場でskipする", () => {
    const scheduler = createScheduler({
      collisionMode: "adaptive",
      backlogPolicy: "drop",
      maxActiveCount: 1,
    });
    scheduler.enqueue(createInput(1, 120));

    const result = scheduler.enqueue(createInput(2, 120));

    expect(result.accepted).toBe(false);
    expect(result.dropped?.comment.responseNumber).toBe(2);
    expect(scheduler.advance(0).pending).toHaveLength(0);
  });

  it("コメント単位のpause中は位置とlaneを保持し、resume後に終了時刻を延長する", () => {
    const scheduler = createScheduler({ collisionMode: "adaptive" });
    scheduler.enqueue(createInput(1, 120));
    const beforePause = scheduler.advance(1).active[0];
    const originalEndAt = beforePause.endAt;

    expect(scheduler.pause(1, 1)).toBe(true);
    const positionWhilePaused = calculateCommentPosition(beforePause, 1);
    expect(calculateCommentPosition(beforePause, 5)).toBe(positionWhilePaused);
    expect(scheduler.advance(5).active).toHaveLength(1);

    expect(scheduler.resume(1, 5)).toBe(true);
    const resumedEndAt = beforePause.endAt;
    expect(resumedEndAt).toBeGreaterThan(originalEndAt);
    expect(scheduler.advance(resumedEndAt - 0.01).active).toHaveLength(1);
    expect(scheduler.advance(resumedEndAt).active).toHaveLength(0);
  });

  it("queueが満杯でも新着を受け入れ、最古の待機コメントをskipする", () => {
    const scheduler = createScheduler({ maxQueueSize: 2 });
    scheduler.enqueue(createInput(1, 120));
    scheduler.advance(0);
    scheduler.enqueue(createInput(2, 120));
    scheduler.enqueue(createInput(3, 120));

    const result = scheduler.enqueue(createInput(4, 120));

    expect(result.accepted).toBe(true);
    expect(result.dropped?.comment.responseNumber).toBe(2);
    expect(scheduler.advance(0).pending.map((input) => input.comment.responseNumber)).toEqual([
      3, 4,
    ]);
  });

  it("queue上限が0ならコメントを受け付けない", () => {
    const scheduler = createScheduler({ maxQueueSize: 0 });

    expect(scheduler.enqueue(createInput(1, 120))).toEqual({ accepted: false, dropped: null });
  });

  it("時刻を逆戻りさせず、resetでは新しい時系列を開始できる", () => {
    const scheduler = createScheduler();
    scheduler.advance(10);

    expect(() => scheduler.advance(9)).toThrow("scheduler time must not move backwards");

    scheduler.clear();
    scheduler.enqueue(createInput(1, 120));
    expect(scheduler.advance(0).active).toHaveLength(1);
  });
});
