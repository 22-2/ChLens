import type { ArchiveReplayTimeline } from "src/features/archive-replay/domain/archive-replay";
import { describe, expect, it } from "vite-plus/test";

import {
  formatReplayClock,
  formatReplayDuration,
  resolveArchiveReplayThreadSelection,
} from "./archive-replay-window-helpers";

describe("formatReplayDuration", () => {
  it("1時間未満は分:秒で表す", () => {
    expect(formatReplayDuration(65)).toBe("01:05");
  });

  it("1時間以上は時:分:秒で表す", () => {
    expect(formatReplayDuration(3_725)).toBe("01:02:05");
  });

  it("負の値や小数は0以上の整数秒に丸める", () => {
    expect(formatReplayDuration(-5)).toBe("00:00");
    expect(formatReplayDuration(59.9)).toBe("00:59");
  });
});

describe("formatReplayClock", () => {
  it("日本時間の時刻を24時間表記で返す", () => {
    // 2000-01-01T00:00:00Z は日本時間で 09:00:00。
    expect(formatReplayClock(Date.UTC(2000, 0, 1, 0, 0, 0))).toBe("09:00:00");
  });
});

describe("resolveArchiveReplayThreadSelection", () => {
  const comment = (offset: number, thread: string, responseNumber: number) => ({
    replayOffsetSeconds: offset,
    sourceThreadUrl: thread,
    responseNumber,
  });
  const timeline = {
    durationSeconds: 100,
    comments: [
      comment(-10, "https://example.com/t/a/", 1),
      comment(10, "https://example.com/t/a/", 2),
      comment(40, "https://example.com/t/b/", 3),
      comment(200, "https://example.com/t/b/", 4),
    ],
  } as unknown as ArchiveReplayTimeline;
  const titles = { "https://example.com/t/a/": "スレA" };

  it("再生位置に最も近い、過ぎたコメントのスレを選ぶ", () => {
    expect(resolveArchiveReplayThreadSelection(timeline, 50, 0, titles)).toEqual({
      threadUrl: "https://example.com/t/b/",
      responseNumber: 3,
      title: "https://example.com/t/b/",
    });
  });

  it("まだ最初のコメントに届かない間は、範囲内の先頭のコメントを選ぶ", () => {
    expect(resolveArchiveReplayThreadSelection(timeline, 0, 0, titles)).toMatchObject({
      threadUrl: "https://example.com/t/a/",
      responseNumber: 2,
      title: "スレA",
    });
  });

  it("同期のずれを足して、範囲外になるコメントは除く", () => {
    expect(resolveArchiveReplayThreadSelection(timeline, 0, 20, titles)).toMatchObject({
      responseNumber: 1,
    });
  });

  it("範囲内のコメントが無ければ null を返す", () => {
    const empty = { durationSeconds: 10, comments: [] } as unknown as ArchiveReplayTimeline;
    expect(resolveArchiveReplayThreadSelection(empty, 0, 0, {})).toBeNull();
  });
});
