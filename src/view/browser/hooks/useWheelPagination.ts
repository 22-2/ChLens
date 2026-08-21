import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export const WHEEL_THRESHOLD = 7;
const COOLDOWN_PERIOD_MS = 1000;
const COUNTER_RESET_DELAY_MS = 800;

interface UseWheelPaginationOptions {
  isEnabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  edge: "top" | "bottom";
  onRefresh: () => void;
}

interface WheelPaginationState {
  count: number;
  direction: "up" | "down" | null;
}

/**
 * スクロール端での連続ホイールを更新操作へ変換する。
 * スクロール対象の探索やページ固有の遷移は呼び出し側に持たせ、一覧・スレッドで共有する。
 */
export function useWheelPagination({
  isEnabled,
  containerRef,
  edge,
  onRefresh,
}: UseWheelPaginationOptions): WheelPaginationState & { isCoolingDown: boolean } {
  const [state, setState] = useState<WheelPaginationState>({ count: 0, direction: null });
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const stateRef = useRef<WheelPaginationState>({ count: 0, direction: null });
  const coolingDownRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const reset = useCallback(() => {
    stateRef.current = { count: 0, direction: null };
    setState(stateRef.current);
  }, []);

  const setCoolingDown = useCallback((value: boolean) => {
    coolingDownRef.current = value;
    setIsCoolingDown(value);
  }, []);

  useEffect(() => {
    if (isEnabled) return;
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    if (cooldownTimerRef.current !== null) window.clearTimeout(cooldownTimerRef.current);
    resetTimerRef.current = null;
    cooldownTimerRef.current = null;
    reset();
    setCoolingDown(false);
  }, [isEnabled, reset, setCoolingDown]);

  useEffect(() => {
    const container = containerRef.current;
    if (!isEnabled || !container) return;

    const handleWheel = (event: WheelEvent) => {
      // ポップアップ自身のスクロールを、背後のスレッド更新ジェスチャーとして
      // 吸収しない。ポータル経由でもイベントが親パネルへ届くため、ここで除外する。
      const eventTarget = event.target;
      if (
        eventTarget instanceof Element &&
        eventTarget.closest('[data-popup="true"], .context-menu, .mini-window')
      ) {
        return;
      }

      if (coolingDownRef.current) {
        event.preventDefault();
        return;
      }

      const isAtTop = container.scrollTop <= 1;
      const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
      const direction = event.deltaY < 0 ? "up" : "down";
      const isAtEdge =
        edge === "top" ? direction === "up" && isAtTop : direction === "down" && isAtBottom;

      if (!isAtEdge) {
        if (stateRef.current.count > 0) reset();
        return;
      }

      event.preventDefault();
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = window.setTimeout(reset, COUNTER_RESET_DELAY_MS);

      const nextState: WheelPaginationState = {
        direction,
        count: stateRef.current.direction === direction ? stateRef.current.count + 1 : 1,
      };
      stateRef.current = nextState;
      setState(nextState);

      if (nextState.count < WHEEL_THRESHOLD) return;

      onRefreshRef.current();
      setCoolingDown(true);
      if (cooldownTimerRef.current !== null) window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = window.setTimeout(() => setCoolingDown(false), COOLDOWN_PERIOD_MS);
      reset();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
      if (cooldownTimerRef.current !== null) window.clearTimeout(cooldownTimerRef.current);
    };
  }, [containerRef, edge, isEnabled, reset, setCoolingDown]);

  return { ...state, isCoolingDown };
}
