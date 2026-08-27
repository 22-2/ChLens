import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

export const WHEEL_THRESHOLD = 7;
const COOLDOWN_PERIOD_MS = 1000;
const COUNTER_RESET_DELAY_MS = 800;
type WheelDirection = "up" | "down";

interface SharedWheelCooldownState {
  direction: WheelDirection | null;
  isCoolingDown: boolean;
}

const INITIAL_SHARED_WHEEL_COOLDOWN_STATE: SharedWheelCooldownState = {
  direction: null,
  isCoolingDown: false,
};

let sharedWheelCooldownState = INITIAL_SHARED_WHEEL_COOLDOWN_STATE;
let sharedCooldownTimer: number | null = null;
const sharedWheelCooldownListeners = new Set<() => void>();

function subscribeToSharedWheelCooldown(listener: () => void): () => void {
  sharedWheelCooldownListeners.add(listener);
  return () => sharedWheelCooldownListeners.delete(listener);
}

function getSharedWheelCooldownSnapshot(): SharedWheelCooldownState {
  return sharedWheelCooldownState;
}

function publishSharedWheelCooldown(nextState: SharedWheelCooldownState): void {
  sharedWheelCooldownState = nextState;
  sharedWheelCooldownListeners.forEach((listener) => listener());
}

function startSharedWheelCooldown(direction: WheelDirection): void {
  if (sharedCooldownTimer !== null) window.clearTimeout(sharedCooldownTimer);

  // 変更理由: 一覧とスレッドは別コンポーネント/別タブに存在するため、hook内のtimerでは
  // 画面切替時に更新受付状態が分裂する。モジュール共有にして、同じブラウザ画面内で連続更新を抑制する。
  publishSharedWheelCooldown({ direction, isCoolingDown: true });
  sharedCooldownTimer = window.setTimeout(() => {
    sharedCooldownTimer = null;
    publishSharedWheelCooldown(INITIAL_SHARED_WHEEL_COOLDOWN_STATE);
  }, COOLDOWN_PERIOD_MS);
}

interface UseWheelPaginationOptions {
  isEnabled: boolean;
  isLoading: boolean;
  containerRef: RefObject<HTMLElement | null>;
  edge: "top" | "bottom";
  onRefresh: () => void;
}

interface WheelPaginationState {
  count: number;
  direction: WheelDirection | null;
}

/**
 * スクロール端での連続ホイールを更新操作へ変換する。
 * スクロール対象の探索やページ固有の遷移は呼び出し側に持たせ、一覧・スレッドで共有する。
 */
export function useWheelPagination({
  isEnabled,
  isLoading,
  containerRef,
  edge,
  onRefresh,
}: UseWheelPaginationOptions): WheelPaginationState & {
  isCoolingDown: boolean;
  isLoading: boolean;
} {
  const [state, setState] = useState<WheelPaginationState>({ count: 0, direction: null });
  const [refreshDirection, setRefreshDirection] = useState<WheelDirection | null>(null);
  const stateRef = useRef<WheelPaginationState>({ count: 0, direction: null });
  const resetTimerRef = useRef<number | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const sharedCooldown = useSyncExternalStore(
    subscribeToSharedWheelCooldown,
    getSharedWheelCooldownSnapshot,
    () => INITIAL_SHARED_WHEEL_COOLDOWN_STATE,
  );

  const reset = useCallback(() => {
    stateRef.current = { count: 0, direction: null };
    setState(stateRef.current);
  }, []);

  useEffect(() => {
    if (isEnabled) return;
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
    reset();
    setRefreshDirection(null);
  }, [isEnabled, reset]);

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

      if (getSharedWheelCooldownSnapshot().isCoolingDown) {
        event.preventDefault();
        return;
      }

      if (isLoading) return;

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

      setRefreshDirection(direction);
      startSharedWheelCooldown(direction);
      onRefreshRef.current();
      reset();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    };
  }, [containerRef, edge, isEnabled, isLoading, reset]);

  const isCoolingDown = isEnabled && sharedCooldown.isCoolingDown;
  const direction = sharedCooldown.isCoolingDown
    ? sharedCooldown.direction
    : (refreshDirection ?? state.direction);

  useEffect(() => {
    if (!isLoading && !sharedCooldown.isCoolingDown && refreshDirection !== null) {
      setRefreshDirection(null);
    }
  }, [isLoading, refreshDirection, sharedCooldown.isCoolingDown]);

  // 変更理由: cooldown開始前はrefreshDirectionが未設定なので、stateの進捗をそのまま表示する。
  // cooldown中は共有方向と更新中表示だけを残し、リセット済みの古いカウントを表示しない。
  const count = sharedCooldown.isCoolingDown ? 0 : state.count;

  return {
    count,
    direction,
    isCoolingDown,
    isLoading: isEnabled && isLoading,
  };
}
