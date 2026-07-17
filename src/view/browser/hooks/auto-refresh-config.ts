import { container } from "src/service-container/index";

export const THREAD_AUTO_REFRESH_CONFIG_KEY = "auto_load_second";
export const DEFAULT_THREAD_AUTO_REFRESH_MS = 5000;
export const MIN_THREAD_AUTO_REFRESH_MS = 3000;
// 新着が来ない更新が連続でこの回数に達したら自動更新を止める。
// 「停止までの時間」は更新間隔に比例する（実時間 ≒ 間隔 × この回数）ため、
// 間隔を変えても係数を据え置きでよい。放置されたスレへのリクエスト垂れ流しを防ぐ目的。
// この定数は idleStopTimeout が "auto"（従来動作）のときのみ使われる。
export const THREAD_AUTO_REFRESH_IDLE_STOP_COUNT = 40;
export const MIN_THREAD_AUTO_REFRESH_SEC = 5;
export const MAX_THREAD_AUTO_REFRESH_SEC = 120;
export const BOARD_AUTO_REFRESH_CONFIG_KEY = "auto_load_second_board";
export const DEFAULT_BOARD_AUTO_REFRESH_MS = 20000;
export const MIN_BOARD_AUTO_REFRESH_MS = 20000;
export const MIN_BOARD_AUTO_REFRESH_SEC = 20;
export const MAX_BOARD_AUTO_REFRESH_SEC = 300;

// -----------------------------------------------------------------------
// 自動停止までの時間（idle stop timeout）の設定
// -----------------------------------------------------------------------
export const THREAD_IDLE_STOP_TIMEOUT_CONFIG_KEY =
  "auto_load_idle_stop_timeout";

export interface IdleStopTimeoutOption {
  /** config に保存する値 */
  value: string;
  /** 表示ラベル */
  label: string;
}

/**
 * "auto" は従来の tick ベース動作（THREAD_AUTO_REFRESH_IDLE_STOP_COUNT 回で停止）。
 * その他の値はミリ秒文字列で、その時間だけ新着が来なければ停止する。
 * "0" は無効（自動停止しない）。
 */
export const IDLE_STOP_TIMEOUT_OPTIONS: readonly IdleStopTimeoutOption[] = [
  { value: "auto", label: "自動" },
  { value: "600000", label: "10分" },
  { value: "1800000", label: "30分" },
  { value: "3600000", label: "1時間" },
  { value: "0", label: "無効" },
];

export const IDLE_STOP_TIMEOUT_DEFAULT = "auto";

export function readIdleStopTimeoutValue(): string {
  const raw = container.config.get(THREAD_IDLE_STOP_TIMEOUT_CONFIG_KEY);
  if (raw == null || raw === "") {
    return IDLE_STOP_TIMEOUT_DEFAULT;
  }
  return raw;
}

export function resolveIdleStopTimeoutMs(value: string): number | null {
  if (value === "auto" || value === "0") {
    return null;
  }
  const ms = Number.parseInt(value, 10);
  if (Number.isNaN(ms) || ms <= 0) {
    return null;
  }
  return ms;
}

export function findIdleStopTimeoutOption(
  value: string,
): IdleStopTimeoutOption {
  const found = IDLE_STOP_TIMEOUT_OPTIONS.find((opt) => opt.value === value);
  return found ?? IDLE_STOP_TIMEOUT_OPTIONS[0];
}

export function readThreadAutoRefreshIntervalMs(): number {
  const rawValue = container.config.get(THREAD_AUTO_REFRESH_CONFIG_KEY);
  const parsedValue = Number.parseInt(rawValue ?? "0", 10);

  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    // UI の既定値と実タイマーがずれると「ON なのに一度も更新されない」ため、
    // 未設定時は 30 秒を共通既定値として扱う。
    return DEFAULT_THREAD_AUTO_REFRESH_MS;
  }

  return parsedValue;
}

export function readThreadAutoRefreshIntervalSec(): number {
  return Math.max(
    MIN_THREAD_AUTO_REFRESH_SEC,
    Math.round(readThreadAutoRefreshIntervalMs() / 1000),
  );
}

export function readBoardAutoRefreshIntervalMs(): number {
  const rawValue = container.config.get(BOARD_AUTO_REFRESH_CONFIG_KEY);
  const parsedValue = Number.parseInt(rawValue ?? "0", 10);

  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    // UI のON/OFFを interval 設定と分離したため、未設定時でも有効な既定値を返して
    // トグルON直後に「値が0なので何も起きない」状態を避ける。
    return DEFAULT_BOARD_AUTO_REFRESH_MS;
  }

  return parsedValue;
}

export function readBoardAutoRefreshIntervalSec(): number {
  return Math.max(
    MIN_BOARD_AUTO_REFRESH_SEC,
    Math.round(readBoardAutoRefreshIntervalMs() / 1000),
  );
}
