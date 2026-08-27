import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { container } from "src/service-container/index";
import {
  MIN_THREAD_AUTO_REFRESH_MS,
  readIdleStopTimeoutValue,
  readThreadAutoRefreshIntervalMs,
  resolveIdleStopTimeoutMs,
  THREAD_AUTO_REFRESH_CONFIG_KEY,
  THREAD_AUTO_REFRESH_IDLE_STOP_COUNT,
} from "src/view/browser/hooks/auto-refresh-config";

interface PendingRefreshSnapshot {
  responseCount: number;
  lastResponseNum: number | null;
  scrollHeight: number;
  shouldScroll: boolean;
  // 自動停止のアイドル判定に数えてよい更新かどうか。
  // ON直後の初回更新は「新着ゼロ」でも放置とは見なさないので false にする。
  isIdleStopCandidate: boolean;
}

type AutoRefreshPhase = "idle" | "scrolling";

interface UseAutoRefreshOptions {
  enabled: boolean;
  expired: boolean;
  loading: boolean;
  pauseAutoScroll: boolean;
  responseCount: number;
  lastResponseNum: number | null;
  rootRef: RefObject<HTMLDivElement | null>;
  requestRefresh: () => void;
  /** 新着が一定回数(=間隔×N)来ず放置と判断したとき、自動更新を止めるために呼ぶ。 */
  onAutoStop?: () => void;
  /** dat落ちを検知して自動更新を止めるとき、一度だけ呼ぶ。 */
  onThreadExpired?: () => void;
}

interface ConfigUpdatedMessage {
  key?: string;
}

export interface UseAutoRefreshResult {
  autoScrollBoundaryRef: RefObject<HTMLDivElement | null>;
  canAutoScroll: boolean;
  isAutoScrolling: boolean;
  intervalMs: number;
  phase: AutoRefreshPhase;
}

export function useAutoRefresh({
  enabled,
  expired,
  loading,
  pauseAutoScroll,
  responseCount,
  lastResponseNum,
  rootRef,
  requestRefresh,
  onAutoStop,
  onThreadExpired,
}: UseAutoRefreshOptions): UseAutoRefreshResult {
  const autoScrollBoundaryRef = useRef<HTMLDivElement>(null);
  const pendingRefreshRef = useRef<PendingRefreshSnapshot | null>(null);
  const requestRefreshRef = useRef(requestRefresh);
  const onAutoStopRef = useRef(onAutoStop);
  const onThreadExpiredRef = useRef(onThreadExpired);
  // 同じスレの再取得では expired が一度 false に戻ることがあるため、
  // 自動更新停止と通知は hook の生存中に一度だけ実行する。
  const threadExpiredHandledRef = useRef(false);
  // 新着が来なかった更新が何回連続したか。新着が来たら 0 に戻す。
  const consecutiveIdleRefreshRef = useRef(0);
  // 最後に新着が来た時刻（epoch ms）。時間ベースの自動停止判定に使う。
  const lastNewResponseTimeRef = useRef<number | null>(null);
  const loadingRef = useRef(loading);
  const prevLoadingRef = useRef(loading);
  const prevEnabledRef = useRef(enabled);
  const latestSnapshotRef = useRef({ responseCount, lastResponseNum });
  const canAutoScrollRef = useRef(false);
  const userInterruptedRef = useRef(false);
  const scrollObserverFrameRef = useRef<number | null>(null);
  const scrollingIndicatorTimerRef = useRef<number | null>(null);
  const [canAutoScroll, setCanAutoScroll] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    document.visibilityState === "visible",
  );
  const [intervalMs, setIntervalMs] = useState(readThreadAutoRefreshIntervalMs);

  const clearScrollingIndicator = useCallback(() => {
    if (scrollingIndicatorTimerRef.current != null) {
      window.clearTimeout(scrollingIndicatorTimerRef.current);
      scrollingIndicatorTimerRef.current = null;
    }
    setIsAutoScrolling(false);
  }, []);

  const showScrollingIndicator = useCallback(() => {
    if (scrollingIndicatorTimerRef.current != null) {
      window.clearTimeout(scrollingIndicatorTimerRef.current);
      scrollingIndicatorTimerRef.current = null;
    }

    // scrollBy 自体は即時でも、状態表示は少し残した方が
    // 「今まさに追従した」ことをユーザーが認識しやすい。
    setIsAutoScrolling(true);
    scrollingIndicatorTimerRef.current = window.setTimeout(() => {
      scrollingIndicatorTimerRef.current = null;
      setIsAutoScrolling(false);
    }, 900);
  }, []);

  useEffect(() => {
    requestRefreshRef.current = requestRefresh;
  }, [requestRefresh]);

  useEffect(() => {
    onAutoStopRef.current = onAutoStop;
  }, [onAutoStop]);

  useEffect(() => {
    onThreadExpiredRef.current = onThreadExpired;
  }, [onThreadExpired]);

  useEffect(() => {
    if (!enabled || !expired || threadExpiredHandledRef.current) {
      return;
    }

    // expired になった時点で保留中の追従を破棄し、停止通知後に古い更新を反映しない。
    threadExpiredHandledRef.current = true;
    pendingRefreshRef.current = null;
    userInterruptedRef.current = false;
    onThreadExpiredRef.current?.();
  }, [enabled, expired]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    latestSnapshotRef.current = { responseCount, lastResponseNum };
  }, [lastResponseNum, responseCount]);

  const getScrollContainer = useCallback((): HTMLElement | null => {
    const host = rootRef.current;
    if (!host) {
      return null;
    }
    const nearestPanel = host.closest(".content-area__tab-panel");
    if (nearestPanel instanceof HTMLElement) {
      return nearestPanel;
    }

    const contentArea = host.closest(".content-area");
    if (!(contentArea instanceof HTMLElement)) {
      return null;
    }

    const activePanel = contentArea.querySelector(".content-area__tab-panel[data-active='true']");
    if (activePanel instanceof HTMLElement) {
      return activePanel;
    }

    // 互換性のため、旧構成（content-area 自体がスクロール）の場合は fallback する。
    return contentArea;
  }, [rootRef]);

  const moveToThreadBottom = useCallback((): HTMLElement | null => {
    const scrollContainer = getScrollContainer();
    if (!scrollContainer) {
      return null;
    }

    // 自動更新ON直後に途中位置のままだと、初回更新だけは追従せず「開始した感」が薄い。
    // 先に最下部へ寄せてから refresh を投げることで、legacy と同じ感覚に揃える。
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    canAutoScrollRef.current = true;
    setCanAutoScroll(true);
    return scrollContainer;
  }, [getScrollContainer]);

  const syncCanAutoScroll = useCallback(() => {
    const scrollContainer = getScrollContainer();
    const boundary = autoScrollBoundaryRef.current;

    if (!scrollContainer || !boundary) {
      canAutoScrollRef.current = false;
      setCanAutoScroll(false);
      return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const boundaryRect = boundary.getBoundingClientRect();
    const viewportBottom = scrollContainer.scrollTop + scrollContainer.clientHeight;
    const boundaryBottom = scrollContainer.scrollTop + boundaryRect.bottom - containerRect.top;
    const nextValue = viewportBottom >= boundaryBottom;

    canAutoScrollRef.current = nextValue;
    setCanAutoScroll((prev) => (prev === nextValue ? prev : nextValue));
  }, [getScrollContainer]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const applyInterval = () => {
      setIntervalMs(readThreadAutoRefreshIntervalMs());
    };

    const handleConfigUpdated = ({ key }: ConfigUpdatedMessage) => {
      if (key === THREAD_AUTO_REFRESH_CONFIG_KEY) {
        applyInterval();
      }
    };

    container.config.ready(applyInterval);
    container.message.on("config_updated", handleConfigUpdated);

    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  useEffect(() => {
    if (enabled) {
      return;
    }

    // OFF にした瞬間に保留中スクロールまで実行すると「止めたのに動く」感触になるので破棄する。
    pendingRefreshRef.current = null;
    userInterruptedRef.current = false;
    // 次に ON にしたとき前回のアイドル累積を引き継がないようリセットする。
    consecutiveIdleRefreshRef.current = 0;
    clearScrollingIndicator();
  }, [clearScrollingIndicator, enabled]);

  useEffect(() => {
    const wasEnabled = prevEnabledRef.current;
    prevEnabledRef.current = enabled;

    if (wasEnabled || !enabled) {
      return;
    }

    const scrollContainer = moveToThreadBottom();
    window.requestAnimationFrame(() => {
      syncCanAutoScroll();
    });

    if (!scrollContainer || expired || loadingRef.current || pendingRefreshRef.current) {
      return;
    }

    const currentSnapshot = latestSnapshotRef.current;
    // ON 直後の初回更新。アイドル累積は ON のタイミングでリセットし、
    // この回は「新着ゼロ」でも放置とは数えない。
    consecutiveIdleRefreshRef.current = 0;
    pendingRefreshRef.current = {
      responseCount: currentSnapshot.responseCount,
      lastResponseNum: currentSnapshot.lastResponseNum,
      scrollHeight: scrollContainer.scrollHeight,
      shouldScroll: true,
      isIdleStopCandidate: false,
    };
    userInterruptedRef.current = false;
    requestRefreshRef.current();
  }, [enabled, expired, moveToThreadBottom, syncCanAutoScroll]);

  useEffect(() => {
    // 書き込み成功後やダブルクリック更新など、この hook のインターバル外から
    // dispatch(RELOAD) されたときは pendingRefresh が積まれず、新着分の追従
    // スクロールが行われない。その結果ビューポートが最下部から外れて
    // canAutoScroll が false になり自動追従が止まってしまうため、
    // 読み込み開始の立ち上がりでスナップショットを補完して同じ追従経路に乗せる。
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;

    if (!enabled || wasLoading || !loading || pendingRefreshRef.current) {
      return;
    }

    const scrollContainer = getScrollContainer();
    if (!scrollContainer) {
      return;
    }

    const currentSnapshot = latestSnapshotRef.current;
    pendingRefreshRef.current = {
      responseCount: currentSnapshot.responseCount,
      lastResponseNum: currentSnapshot.lastResponseNum,
      scrollHeight: scrollContainer.scrollHeight,
      shouldScroll: canAutoScrollRef.current,
      // 手動・書き込み起因の更新は放置判定の対象にしない。
      isIdleStopCandidate: false,
    };
    userInterruptedRef.current = false;
  }, [enabled, getScrollContainer, loading]);

  useEffect(() => {
    const scrollContainer = getScrollContainer();
    if (!scrollContainer) {
      return;
    }

    const scheduleSync = () => {
      if (scrollObserverFrameRef.current != null) {
        return;
      }

      scrollObserverFrameRef.current = window.requestAnimationFrame(() => {
        scrollObserverFrameRef.current = null;
        syncCanAutoScroll();
      });
    };

    const handleWheel = () => {
      if (pendingRefreshRef.current || isAutoScrolling) {
        // smooth scroll を使わない代わりに、ユーザー操作が入ったフレームでは
        // 予定していた自動追従を明示的に取り消して手動スクロールを優先する。
        userInterruptedRef.current = true;
      }
    };

    scheduleSync();
    scrollContainer.addEventListener("scroll", scheduleSync, { passive: true });
    scrollContainer.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("resize", scheduleSync);

    return () => {
      if (scrollObserverFrameRef.current != null) {
        window.cancelAnimationFrame(scrollObserverFrameRef.current);
        scrollObserverFrameRef.current = null;
      }

      scrollContainer.removeEventListener("scroll", scheduleSync);
      scrollContainer.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", scheduleSync);
    };
  }, [getScrollContainer, isAutoScrolling, syncCanAutoScroll]);

  useEffect(() => {
    return () => {
      if (scrollingIndicatorTimerRef.current != null) {
        window.clearTimeout(scrollingIndicatorTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled || expired || !isDocumentVisible || intervalMs < MIN_THREAD_AUTO_REFRESH_MS) {
      return;
    }

    const timerId = window.setInterval(() => {
      if (loadingRef.current || pendingRefreshRef.current) {
        return;
      }

      const scrollContainer = getScrollContainer();
      if (!scrollContainer) {
        return;
      }

      const currentSnapshot = latestSnapshotRef.current;
      pendingRefreshRef.current = {
        responseCount: currentSnapshot.responseCount,
        lastResponseNum: currentSnapshot.lastResponseNum,
        scrollHeight: scrollContainer.scrollHeight,
        shouldScroll: canAutoScrollRef.current,
        isIdleStopCandidate: true,
      };
      userInterruptedRef.current = false;

      // 手動更新と同じ RELOAD 経路を使って forceUpdate を一箇所に寄せる。
      // 取得条件が分岐すると「右クリック更新だけ別挙動」が起きやすいため。
      requestRefreshRef.current();
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
    };
  }, [enabled, expired, getScrollContainer, intervalMs, isDocumentVisible]);

  useLayoutEffect(() => {
    syncCanAutoScroll();

    if (!enabled || loading || expired) {
      if (!enabled || expired) {
        pendingRefreshRef.current = null;
      }
      return;
    }

    const pendingRefresh = pendingRefreshRef.current;
    if (!pendingRefresh) {
      return;
    }

    pendingRefreshRef.current = null;

    const hasNewResponses =
      pendingRefresh.responseCount !== responseCount ||
      pendingRefresh.lastResponseNum !== lastResponseNum;

    // 新着があった場合は最終新着時刻を更新（時間ベース停止の判定用）
    if (hasNewResponses) {
      lastNewResponseTimeRef.current = Date.now();
    }

    // 自動停止（アイドル検知）。
    // 設定に応じて tick ベース（従来動作）または時間ベースで判定する。
    if (pendingRefresh.isIdleStopCandidate) {
      const idleStopTimeoutValue = readIdleStopTimeoutValue();
      const timeoutMs = resolveIdleStopTimeoutMs(idleStopTimeoutValue);

      if (timeoutMs === null && idleStopTimeoutValue === "auto") {
        // tick ベース（従来動作）: 連続アイドル回数で判定
        if (hasNewResponses) {
          consecutiveIdleRefreshRef.current = 0;
        } else {
          consecutiveIdleRefreshRef.current += 1;
          if (consecutiveIdleRefreshRef.current >= THREAD_AUTO_REFRESH_IDLE_STOP_COUNT) {
            consecutiveIdleRefreshRef.current = 0;
            onAutoStopRef.current?.();
            return;
          }
        }
      } else if (timeoutMs !== null) {
        // 時間ベース: 最後の新着から timeoutMs 経過で停止
        if (!hasNewResponses && lastNewResponseTimeRef.current != null) {
          const elapsed = Date.now() - lastNewResponseTimeRef.current;
          if (elapsed >= timeoutMs) {
            lastNewResponseTimeRef.current = null;
            onAutoStopRef.current?.();
            return;
          }
        }
      }
      // idleStopTimeoutValue === "0"（無効）の場合は何もしない
    }

    if (!hasNewResponses || userInterruptedRef.current) {
      return;
    }

    if (pauseAutoScroll) {
      // ポップアップ操作中はユーザーの文脈を優先し、
      // 自動更新だけ継続して自動スクロールはこの回を破棄する。
      return;
    }

    const scrollContainer = getScrollContainer();
    if (!scrollContainer) {
      return;
    }

    const deltaHeight = scrollContainer.scrollHeight - pendingRefresh.scrollHeight;
    if (!pendingRefresh.shouldScroll || deltaHeight <= 0) {
      return;
    }

    scrollContainer.scrollBy({ top: deltaHeight, behavior: "auto" });
    showScrollingIndicator();

    window.requestAnimationFrame(() => {
      syncCanAutoScroll();
    });
  }, [
    enabled,
    expired,
    getScrollContainer,
    lastResponseNum,
    loading,
    pauseAutoScroll,
    responseCount,
    showScrollingIndicator,
    syncCanAutoScroll,
  ]);

  return {
    autoScrollBoundaryRef,
    canAutoScroll,
    isAutoScrolling,
    intervalMs,
    phase: isAutoScrolling ? "scrolling" : "idle",
  };
}
