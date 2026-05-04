import { container } from "src/service-container/index";

export const THREAD_AUTO_REFRESH_CONFIG_KEY = "auto_load_second";
export const DEFAULT_THREAD_AUTO_REFRESH_MS = 5000;
export const MIN_THREAD_AUTO_REFRESH_MS = 3000;
export const MIN_THREAD_AUTO_REFRESH_SEC = 5;
export const MAX_THREAD_AUTO_REFRESH_SEC = 120;

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
