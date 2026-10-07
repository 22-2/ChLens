import {
  resolveIdleStopTimeoutMs,
  THREAD_AUTO_REFRESH_IDLE_STOP_COUNT,
} from "src/features/auto-refresh/browser/auto-refresh-config";

/**
 * 放置による自動停止の判定方式。
 * - count: 新着なしの更新が連続 limit 回に達したら停止する（"auto" の従来動作）
 * - time: 最後の新着から timeoutMs 経過したら停止する
 * - disabled: 自動停止しない
 */
export type IdleStopMode =
  | { kind: "count"; limit: number }
  | { kind: "time"; timeoutMs: number }
  | { kind: "disabled" };

export interface IdleStopState {
  /** 新着が来なかった更新が何回連続したか。新着が来たら 0 に戻す。 */
  consecutiveIdleRefreshes: number;
  /**
   * 最後に新着が来た時刻（epoch ms）。時間ベースの判定に使う。
   * 未設定なら、次の判定対象の空振りを計測開始点にする。
   */
  lastNewResponseAt: number | null;
}

export interface IdleStopInput {
  hasNewResponses: boolean;
  /** 自動停止のアイドル判定に数えてよい更新かどうか（タイマー起点の更新だけ true）。 */
  isIdleStopCandidate: boolean;
  /** 次スレ探索中は停止を保留し、探索終了後の次回更新で停止できる状態を保つ。 */
  deferStop: boolean;
  mode: IdleStopMode;
  now: number;
}

export interface IdleStopResult {
  state: IdleStopState;
  shouldStop: boolean;
}

export const INITIAL_IDLE_STOP_STATE: IdleStopState = {
  consecutiveIdleRefreshes: 0,
  lastNewResponseAt: null,
};

export function resolveIdleStopMode(value: string): IdleStopMode {
  const timeoutMs = resolveIdleStopTimeoutMs(value);
  if (timeoutMs !== null) {
    return { kind: "time", timeoutMs };
  }
  if (value === "auto") {
    return { kind: "count", limit: THREAD_AUTO_REFRESH_IDLE_STOP_COUNT };
  }
  // "0"（無効）と解釈できない値は、意図せず更新が止まらないよう停止しない側へ倒す。
  return { kind: "disabled" };
}

/**
 * 更新完了ごとに、放置による自動停止を行うかを判定する。
 *
 * hook の layout effect に埋め込むと DOM なしで検証できず、回数・時間・保留の
 * 組み合わせが追いにくいため、状態遷移を純関数に切り出している。
 */
export function evaluateIdleStop(state: IdleStopState, input: IdleStopInput): IdleStopResult {
  const { hasNewResponses, isIdleStopCandidate, deferStop, mode, now } = input;
  const next: IdleStopState = {
    ...state,
    // 手動更新で届いた新着も「放置されていない」根拠なので、候補かどうかに関係なく記録する。
    lastNewResponseAt: hasNewResponses ? now : state.lastNewResponseAt,
  };

  if (!isIdleStopCandidate) {
    return { state: next, shouldStop: false };
  }

  switch (mode.kind) {
    case "count": {
      if (hasNewResponses) {
        return { state: { ...next, consecutiveIdleRefreshes: 0 }, shouldStop: false };
      }
      const count = next.consecutiveIdleRefreshes + 1;
      if (count < mode.limit) {
        return { state: { ...next, consecutiveIdleRefreshes: count }, shouldStop: false };
      }
      if (deferStop) {
        // 次スレ探索が終わるまで累積を保持し、解除後の次回更新で通常停止へ戻す。
        return { state: { ...next, consecutiveIdleRefreshes: mode.limit }, shouldStop: false };
      }
      return { state: { ...next, consecutiveIdleRefreshes: 0 }, shouldStop: true };
    }
    case "time": {
      if (hasNewResponses) {
        return { state: next, shouldStop: false };
      }
      if (next.lastNewResponseAt == null) {
        // 変更理由: 以前は基準時刻が未設定のまま判定を飛ばしていたため、ON 後に一度も
        // 新着が来ないスレでは時間ベース停止が永遠に発火しなかった。最初の空振りを
        // 計測開始点にして、新着がなくても指定時間で止まるようにする。
        return { state: { ...next, lastNewResponseAt: now }, shouldStop: false };
      }
      if (now - next.lastNewResponseAt < mode.timeoutMs) {
        return { state: next, shouldStop: false };
      }
      if (deferStop) {
        // 保留中に基準時刻を消すと、探索終了後も時間ベース停止へ戻れない。
        return { state: next, shouldStop: false };
      }
      return { state: { ...next, lastNewResponseAt: null }, shouldStop: true };
    }
    case "disabled":
      return { state: next, shouldStop: false };
  }
}
