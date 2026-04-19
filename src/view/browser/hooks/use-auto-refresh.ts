import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { container } from "src/service-container/index";

const THREAD_AUTO_REFRESH_CONFIG_KEY = "auto_load_second";
const MIN_THREAD_AUTO_REFRESH_MS = 3000;

interface PendingRefreshSnapshot {
  responseCount: number;
  lastResponseNum: number | null;
  scrollHeight: number;
  shouldScroll: boolean;
}

interface UseAutoRefreshOptions {
  enabled: boolean;
  expired: boolean;
  loading: boolean;
  responseCount: number;
  lastResponseNum: number | null;
  rootRef: RefObject<HTMLDivElement | null>;
  requestRefresh: () => void;
}

interface ConfigUpdatedMessage {
  key?: string;
}

export interface UseAutoRefreshResult {
  autoScrollBoundaryRef: RefObject<HTMLDivElement | null>;
  canAutoScroll: boolean;
  isAutoScrolling: boolean;
  intervalMs: number;
}

function readThreadAutoRefreshInterval(): number {
  const rawValue = container.config.get(THREAD_AUTO_REFRESH_CONFIG_KEY);
  const parsedValue = Number.parseInt(rawValue ?? "0", 10);
  if (Number.isNaN(parsedValue)) {
    return 0;
  }
  return parsedValue;
}

export function useAutoRefresh({
  enabled,
  expired,
  loading,
  responseCount,
  lastResponseNum,
  rootRef,
  requestRefresh,
}: UseAutoRefreshOptions): UseAutoRefreshResult {
  const autoScrollBoundaryRef = useRef<HTMLDivElement>(null);
  const pendingRefreshRef = useRef<PendingRefreshSnapshot | null>(null);
  const requestRefreshRef = useRef(requestRefresh);
  const loadingRef = useRef(loading);
  const latestSnapshotRef = useRef({ responseCount, lastResponseNum });
  const canAutoScrollRef = useRef(false);
  const userInterruptedRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const scrollObserverFrameRef = useRef<number | null>(null);
  const [canAutoScroll, setCanAutoScroll] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    document.visibilityState === "visible",
  );
  const [intervalMs, setIntervalMs] = useState(readThreadAutoRefreshInterval);

  useEffect(() => {
    requestRefreshRef.current = requestRefresh;
  }, [requestRefresh]);

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
    const containerElement = host.closest(".content-area");
    return containerElement instanceof HTMLElement ? containerElement : null;
  }, [rootRef]);

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
    const boundaryBottom =
      scrollContainer.scrollTop + boundaryRect.bottom - containerRect.top;
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
      setIntervalMs(readThreadAutoRefreshInterval());
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
    isAutoScrollingRef.current = false;
    setIsAutoScrolling(false);
  }, [enabled]);

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

        if (isAutoScrollingRef.current) {
          isAutoScrollingRef.current = false;
          setIsAutoScrolling(false);
        }
      });
    };

    const handleWheel = () => {
      if (pendingRefreshRef.current || isAutoScrollingRef.current) {
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
  }, [getScrollContainer, syncCanAutoScroll]);

  useEffect(() => {
    if (
      !enabled ||
      expired ||
      !isDocumentVisible ||
      intervalMs < MIN_THREAD_AUTO_REFRESH_MS
    ) {
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

    if (!enabled || loading) {
      if (!enabled) {
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
    if (!hasNewResponses || userInterruptedRef.current) {
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

    isAutoScrollingRef.current = true;
    setIsAutoScrolling(true);
    scrollContainer.scrollBy({ top: deltaHeight, behavior: "auto" });

    window.requestAnimationFrame(() => {
      isAutoScrollingRef.current = false;
      setIsAutoScrolling(false);
      syncCanAutoScroll();
    });
  }, [
    enabled,
    getScrollContainer,
    lastResponseNum,
    loading,
    responseCount,
    syncCanAutoScroll,
  ]);

  return {
    autoScrollBoundaryRef,
    canAutoScroll,
    isAutoScrolling,
    intervalMs,
  };
}
