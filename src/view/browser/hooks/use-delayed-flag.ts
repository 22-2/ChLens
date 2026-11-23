import { useEffect, useState } from "react";

/** 待ち表示を出すまでの既定の待ち時間。 */
export const DEFAULT_LOADING_INDICATOR_DELAY_MS = 300;

/**
 * active が delayMs 以上続いたときだけ true を返す。
 *
 * 変更理由: すぐ終わる読み込みでもスピナーを出すと、一瞬だけ表示されてちらついて見える。
 * 待ちが目に見える長さになったときだけ待ち表示を出すために使う。
 */
export function useDelayedFlag(
  active: boolean,
  delayMs: number = DEFAULT_LOADING_INDICATOR_DELAY_MS,
): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) {
      setElapsed(false);
      return;
    }
    const timer = window.setTimeout(() => setElapsed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return active && elapsed;
}
