import { THREAD_AUTO_REFRESH_IDLE_STOP_COUNT } from "src/view/browser/hooks/auto-refresh-config";
import {
  evaluateIdleStop,
  type IdleStopInput,
  type IdleStopMode,
  type IdleStopState,
  INITIAL_IDLE_STOP_STATE,
  resolveIdleStopMode,
} from "src/view/browser/hooks/auto-refresh-idle-stop";
import { describe, expect, it } from "vite-plus/test";

const COUNT_MODE: IdleStopMode = { kind: "count", limit: 3 };
const TIME_MODE: IdleStopMode = { kind: "time", timeoutMs: 10_000 };

function input(overrides: Partial<IdleStopInput> = {}): IdleStopInput {
  return {
    hasNewResponses: false,
    isIdleStopCandidate: true,
    deferStop: false,
    mode: COUNT_MODE,
    now: 0,
    ...overrides,
  };
}

function state(overrides: Partial<IdleStopState> = {}): IdleStopState {
  return { ...INITIAL_IDLE_STOP_STATE, ...overrides };
}

describe("resolveIdleStopMode", () => {
  it("auto は従来の回数ベースとして扱う", () => {
    expect(resolveIdleStopMode("auto")).toEqual({
      kind: "count",
      limit: THREAD_AUTO_REFRESH_IDLE_STOP_COUNT,
    });
  });

  it("ミリ秒の文字列は時間ベースとして扱う", () => {
    expect(resolveIdleStopMode("600000")).toEqual({ kind: "time", timeoutMs: 600000 });
  });

  it.each(["0", "", "abc", "-1"])("無効値 %j では自動停止しない", (value) => {
    expect(resolveIdleStopMode(value)).toEqual({ kind: "disabled" });
  });
});

describe("evaluateIdleStop", () => {
  describe("共通", () => {
    it("初期状態を書き換えない", () => {
      evaluateIdleStop(INITIAL_IDLE_STOP_STATE, input({ hasNewResponses: true, now: 5 }));
      expect(INITIAL_IDLE_STOP_STATE).toEqual({
        consecutiveIdleRefreshes: 0,
        lastNewResponseAt: null,
      });
    });

    it("判定対象外の更新でも新着時刻は記録するが累積は変えない", () => {
      const result = evaluateIdleStop(
        state({ consecutiveIdleRefreshes: 2 }),
        input({ hasNewResponses: true, isIdleStopCandidate: false, now: 1234 }),
      );
      expect(result).toEqual({
        state: { consecutiveIdleRefreshes: 2, lastNewResponseAt: 1234 },
        shouldStop: false,
      });
    });

    it("判定対象外の新着なし更新では停止も累積もしない", () => {
      const result = evaluateIdleStop(
        state({ consecutiveIdleRefreshes: 2 }),
        input({ isIdleStopCandidate: false }),
      );
      expect(result).toEqual({ state: state({ consecutiveIdleRefreshes: 2 }), shouldStop: false });
    });

    it("無効設定では何回空振りしても停止しない", () => {
      const result = evaluateIdleStop(
        state({ consecutiveIdleRefreshes: 999, lastNewResponseAt: 0 }),
        input({ mode: { kind: "disabled" }, now: 1e9 }),
      );
      expect(result.shouldStop).toBe(false);
    });
  });

  describe("回数ベース", () => {
    it("閾値の手前までは累積だけ進める", () => {
      const result = evaluateIdleStop(state({ consecutiveIdleRefreshes: 1 }), input());
      expect(result).toEqual({ state: state({ consecutiveIdleRefreshes: 2 }), shouldStop: false });
    });

    it("閾値ちょうどで停止し、累積をリセットする", () => {
      const result = evaluateIdleStop(state({ consecutiveIdleRefreshes: 2 }), input());
      expect(result).toEqual({ state: state({ consecutiveIdleRefreshes: 0 }), shouldStop: true });
    });

    it("新着があれば累積をリセットする", () => {
      const result = evaluateIdleStop(
        state({ consecutiveIdleRefreshes: 2 }),
        input({ hasNewResponses: true, now: 50 }),
      );
      expect(result).toEqual({
        state: { consecutiveIdleRefreshes: 0, lastNewResponseAt: 50 },
        shouldStop: false,
      });
    });

    it("保留中は閾値で止めず、閾値の値を保ったまま待つ", () => {
      const deferred = evaluateIdleStop(
        state({ consecutiveIdleRefreshes: 2 }),
        input({ deferStop: true }),
      );
      expect(deferred).toEqual({
        state: state({ consecutiveIdleRefreshes: 3 }),
        shouldStop: false,
      });

      // 保留が続いても累積は閾値で頭打ちになる。
      const stillDeferred = evaluateIdleStop(deferred.state, input({ deferStop: true }));
      expect(stillDeferred.state.consecutiveIdleRefreshes).toBe(3);

      // 保留が解除された次の空振りで止まる。
      expect(evaluateIdleStop(stillDeferred.state, input()).shouldStop).toBe(true);
    });
  });

  describe("時間ベース", () => {
    it("最後の新着から指定時間に満たなければ停止しない", () => {
      const result = evaluateIdleStop(
        state({ lastNewResponseAt: 1000 }),
        input({ mode: TIME_MODE, now: 10_999 }),
      );
      expect(result.shouldStop).toBe(false);
    });

    it("最後の新着から指定時間ちょうどで停止し、基準時刻を消す", () => {
      const result = evaluateIdleStop(
        state({ lastNewResponseAt: 1000 }),
        input({ mode: TIME_MODE, now: 11_000 }),
      );
      expect(result).toEqual({ state: state({ lastNewResponseAt: null }), shouldStop: true });
    });

    it("新着があれば基準時刻を更新して停止しない", () => {
      const result = evaluateIdleStop(
        state({ lastNewResponseAt: 0 }),
        input({ mode: TIME_MODE, hasNewResponses: true, now: 50_000 }),
      );
      expect(result).toEqual({ state: state({ lastNewResponseAt: 50_000 }), shouldStop: false });
    });

    it("基準時刻が未設定なら最初の空振りを計測開始点にする", () => {
      const started = evaluateIdleStop(
        INITIAL_IDLE_STOP_STATE,
        input({ mode: TIME_MODE, now: 3000 }),
      );
      expect(started).toEqual({ state: state({ lastNewResponseAt: 3000 }), shouldStop: false });
      expect(
        evaluateIdleStop(started.state, input({ mode: TIME_MODE, now: 12_999 })).shouldStop,
      ).toBe(false);
      expect(
        evaluateIdleStop(started.state, input({ mode: TIME_MODE, now: 13_000 })).shouldStop,
      ).toBe(true);
    });

    it("回数の累積には影響されない", () => {
      const result = evaluateIdleStop(
        state({ consecutiveIdleRefreshes: 999, lastNewResponseAt: 0 }),
        input({ mode: TIME_MODE, now: 1 }),
      );
      expect(result.shouldStop).toBe(false);
    });

    it("保留中は基準時刻を保ったまま待ち、解除後に停止する", () => {
      const deferred = evaluateIdleStop(
        state({ lastNewResponseAt: 0 }),
        input({ mode: TIME_MODE, deferStop: true, now: 20_000 }),
      );
      expect(deferred).toEqual({ state: state({ lastNewResponseAt: 0 }), shouldStop: false });
      expect(
        evaluateIdleStop(deferred.state, input({ mode: TIME_MODE, now: 21_000 })).shouldStop,
      ).toBe(true);
    });
  });
});
