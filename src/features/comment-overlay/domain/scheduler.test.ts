import { describe, expect, it } from "vite-plus/test";
import type { CommentCandidate } from "./comment-types";
import {
  calculateCommentDuration,
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

describe("コメントの速度モデル", () => {
  it("ステージ幅と基準速度から通過時間を求める", () => {
    const duration = calculateCommentDuration(600, DEFAULT_COMMENT_BASE_SPEED_PX_PER_SECOND);

    expect(duration).toBeCloseTo(600 / 144);
  });

  it("コメント幅を含めた実速度を求める", () => {
    const duration = calculateCommentDuration(600, 144);

    expect(calculateCommentSpeed(600, 120, duration)).toBeCloseTo(172.8);
  });
});

describe("CommentScheduler", () => {
  it("コメントをqueueしてからlaneへ投入し、終了時に解放する", () => {
    const scheduler = new CommentScheduler({
      stageWidth: 600,
      laneCount: 1,
    });
    const input = createInput(1, 120);
    const duration = calculateCommentDuration(600, 144);

    expect(scheduler.enqueue(input)).toBe(true);
    expect(scheduler.advance(0).active).toHaveLength(1);
    expect(scheduler.advance(duration).active).toHaveLength(0);
  });

  it("開始位置と終了位置がステージ幅とコメント幅に対応する", () => {
    const scheduler = new CommentScheduler({
      stageWidth: 600,
      laneCount: 1,
    });
    scheduler.enqueue(createInput(1, 120));
    const active = scheduler.advance(0).active[0];

    expect(calculateCommentPosition(active, 0)).toBe(600);
    expect(calculateCommentPosition(active, active.endAt)).toBe(-120);
  });

  it("同時投入されたコメントを別laneへ割り当てる", () => {
    const scheduler = new CommentScheduler({
      stageWidth: 600,
      laneCount: 2,
    });
    scheduler.enqueue(createInput(1, 120));
    scheduler.enqueue(createInput(2, 120));

    const snapshot = scheduler.advance(0);

    expect(snapshot.active.map((comment) => comment.laneIndex)).toEqual([0, 1]);
    expect(snapshot.pending).toHaveLength(0);
  });

  it("同じlaneでは入口が空くまで次のコメントを待たせる", () => {
    const scheduler = new CommentScheduler({
      stageWidth: 600,
      laneCount: 1,
    });
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
    const scheduler = new CommentScheduler({
      stageWidth: 600,
      laneCount: 1,
    });
    const duration = calculateCommentDuration(600, 144);
    const longCommentSpeed = calculateCommentSpeed(600, 300, duration);
    const safeStartAt = duration - 600 / longCommentSpeed;

    scheduler.enqueue(createInput(1, 20));
    scheduler.advance(0);
    scheduler.enqueue(createInput(2, 300));

    expect(scheduler.advance(safeStartAt - 0.01).pending).toHaveLength(1);
    expect(scheduler.advance(safeStartAt).pending).toHaveLength(0);
  });

  it("queue上限を超えたコメントを受け付けない", () => {
    const scheduler = new CommentScheduler({
      stageWidth: 600,
      laneCount: 1,
      maxQueueSize: 1,
    });

    expect(scheduler.enqueue(createInput(1, 120))).toBe(true);
    expect(scheduler.enqueue(createInput(2, 120))).toBe(false);
    expect(scheduler.advance(0).pending).toHaveLength(0);
  });

  it("時刻を逆戻りさせず、resetでは新しい時系列を開始できる", () => {
    const scheduler = new CommentScheduler({
      stageWidth: 600,
      laneCount: 1,
    });
    scheduler.advance(10);

    expect(() => scheduler.advance(9)).toThrow("scheduler time must not move backwards");

    scheduler.clear();
    scheduler.enqueue(createInput(1, 120));
    expect(scheduler.advance(0).active).toHaveLength(1);
  });
});
