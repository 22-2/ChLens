import {
  compareRefreshSnapshot,
  mergePendingRefresh,
  type PendingRefreshSnapshot,
} from "src/view/browser/hooks/auto-refresh-snapshot";
import { describe, expect, it } from "vite-plus/test";

const TIMER = { isIdleStopCandidate: true, shouldNotify: true };
const MANUAL = { isIdleStopCandidate: false, shouldNotify: false };

describe("mergePendingRefresh", () => {
  it("完了待ちがなければ現在の件数で記録を始める", () => {
    expect(mergePendingRefresh(null, { responseCount: 10, lastResponseNum: 10 }, TIMER)).toEqual({
      responseCount: 10,
      lastResponseNum: 10,
      isIdleStopCandidate: true,
      shouldNotify: true,
    });
  });

  it("完了待ちに重なった更新では、最初の件数を保つ", () => {
    const pending = mergePendingRefresh(null, { responseCount: 10, lastResponseNum: 10 }, TIMER);
    const merged = mergePendingRefresh(pending, { responseCount: 12, lastResponseNum: 12 }, TIMER);
    expect(merged).toMatchObject({ responseCount: 10, lastResponseNum: 10 });
  });

  it("タイマー更新に手動更新が割り込むと、放置判定から外すが通知意図は残す", () => {
    const pending = mergePendingRefresh(null, { responseCount: 10, lastResponseNum: 10 }, TIMER);
    expect(
      mergePendingRefresh(pending, { responseCount: 10, lastResponseNum: 10 }, MANUAL),
    ).toEqual({
      responseCount: 10,
      lastResponseNum: 10,
      isIdleStopCandidate: false,
      shouldNotify: true,
    });
  });

  it("手動更新の完了待ちにタイマー更新が重なっても、放置判定の対象には戻さない", () => {
    const pending = mergePendingRefresh(null, { responseCount: 10, lastResponseNum: 10 }, MANUAL);
    expect(mergePendingRefresh(pending, { responseCount: 10, lastResponseNum: 10 }, TIMER)).toEqual(
      { responseCount: 10, lastResponseNum: 10, isIdleStopCandidate: false, shouldNotify: true },
    );
  });

  it("元の記録を書き換えない", () => {
    const pending: PendingRefreshSnapshot = {
      responseCount: 1,
      lastResponseNum: 1,
      isIdleStopCandidate: true,
      shouldNotify: false,
    };
    mergePendingRefresh(
      pending,
      { responseCount: 1, lastResponseNum: 1 },
      { ...MANUAL, shouldNotify: true },
    );
    expect(pending).toEqual({
      responseCount: 1,
      lastResponseNum: 1,
      isIdleStopCandidate: true,
      shouldNotify: false,
    });
  });
});

describe("compareRefreshSnapshot", () => {
  it("件数も末尾も同じなら新着なし", () => {
    expect(
      compareRefreshSnapshot(
        { responseCount: 5, lastResponseNum: 5 },
        { responseCount: 5, lastResponseNum: 5 },
      ),
    ).toEqual({ hasNewResponses: false, newResponseCount: 0 });
  });

  it("増えた件数を新着数として返す", () => {
    expect(
      compareRefreshSnapshot(
        { responseCount: 5, lastResponseNum: 5 },
        { responseCount: 8, lastResponseNum: 8 },
      ),
    ).toEqual({ hasNewResponses: true, newResponseCount: 3 });
  });

  it("NG などで件数が変わらず末尾だけ変わっても、新着1件として扱う", () => {
    expect(
      compareRefreshSnapshot(
        { responseCount: 5, lastResponseNum: 5 },
        { responseCount: 5, lastResponseNum: 6 },
      ),
    ).toEqual({ hasNewResponses: true, newResponseCount: 1 });
  });

  it("空のスレッドから最初のレスが届いたら新着として扱う", () => {
    expect(
      compareRefreshSnapshot(
        { responseCount: 0, lastResponseNum: null },
        { responseCount: 1, lastResponseNum: 1 },
      ),
    ).toEqual({ hasNewResponses: true, newResponseCount: 1 });
  });
});
