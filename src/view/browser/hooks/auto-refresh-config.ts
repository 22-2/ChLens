import { container } from "src/service-container/index";

export const THREAD_AUTO_REFRESH_CONFIG_KEY = "auto_load_second";
export const DEFAULT_THREAD_AUTO_REFRESH_MS = 5000;
export const MIN_THREAD_AUTO_REFRESH_MS = 3000;
// 新着が来ない更新が連続でこの回数に達したら自動更新を止める。
// 「停止までの時間」は更新間隔に比例する（実時間 ≒ 間隔 × この回数）ため、
// 間隔を変えても係数を据え置きでよい。放置されたスレへのリクエスト垂れ流しを防ぐ目的。
export const THREAD_AUTO_REFRESH_IDLE_STOP_COUNT = 40;
export const MIN_THREAD_AUTO_REFRESH_SEC = 5;
export const MAX_THREAD_AUTO_REFRESH_SEC = 120;
export const BOARD_AUTO_REFRESH_CONFIG_KEY = "auto_load_second_board";
export const DEFAULT_BOARD_AUTO_REFRESH_MS = 20000;
export const MIN_BOARD_AUTO_REFRESH_MS = 20000;
export const MIN_BOARD_AUTO_REFRESH_SEC = 20;
export const MAX_BOARD_AUTO_REFRESH_SEC = 300;

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
  return Math.max(MIN_BOARD_AUTO_REFRESH_SEC, Math.round(readBoardAutoRefreshIntervalMs() / 1000));
}
