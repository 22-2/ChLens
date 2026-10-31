import { act, cleanup, render, screen } from "@testing-library/react";
import React, { useEffect, useState } from "react";
import { shouldDeferExpiredAutoRefreshStop } from "src/features/auto-refresh/browser/auto-refresh-stop";
import { useAutoRefresh } from "src/features/auto-refresh/browser/use-auto-refresh";
import { useLiveChatResponses } from "src/features/live-chat/browser/use-live-chat-responses";
import { useThreadRefreshController } from "src/features/thread/browser/use-thread-refresh-controller";
import { container } from "src/service-container/index";
import type { IConfig, IMessage } from "src/service-container/interfaces";
import { afterEach, beforeEach, type Mock, vi } from "vite-plus/test";

interface TestRectOptions {
  top: number;
  bottom: number;
}

// jsdom の HTMLElement#scrollBy は ScrollToOptions 単一引数のオーバーロードを型に持たないため、
// 代入ではなく Object.assign で差し替えて、型エラーを抑止するコメントを不要にする。
export function mockScrollBy(
  element: HTMLElement,
  scrollBy: (options: ScrollToOptions) => void,
): void {
  Object.assign(element, { scrollBy });
}

export function createRect({ top, bottom }: TestRectOptions): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom,
    left: 0,
    right: 240,
    width: 240,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}

interface TestResizeObserver {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  trigger: () => void;
}

export const resizeObservers: TestResizeObserver[] = [];

class ResizeObserverStub implements TestResizeObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

export function AutoRefreshHarness({
  enabled = true,
  startAtBottom = false,
  active = true,
  refreshKey = 0,
  expired = false,
  stopped = false,
  scopeUrl = "https://example.com/test/read.cgi/board/thread-a/",
  loading = false,
  pauseAutoScroll = false,
  pauseRefresh = false,
  onRequestRefresh,
  onNewResponses,
  onAutoStop,
  deferAutoStop = false,
  configureScrollContainer,
  onThreadExpired,
  onThreadExpiredDetected,
  deferExpiredStop = false,
  liveChatMode = false,
  hasReachedThreadLimit = false,
}: {
  enabled?: boolean;
  startAtBottom?: boolean;
  active?: boolean;
  refreshKey?: number;
  expired?: boolean;
  stopped?: boolean;
  scopeUrl?: string;
  loading?: boolean;
  pauseAutoScroll?: boolean;
  pauseRefresh?: boolean;
  onRequestRefresh: () => void;
  onNewResponses?: (count: number, previousLastResponseNum: number | null) => void;
  onAutoStop?: () => void;
  deferAutoStop?: boolean;
  configureScrollContainer?: (scrollContainer: HTMLDivElement) => void;
  onThreadExpired?: () => void;
  onThreadExpiredDetected?: () => void;
  deferExpiredStop?: boolean;
  liveChatMode?: boolean;
  hasReachedThreadLimit?: boolean;
}) {
  const [responses, setResponses] = useState([1, 2]);
  const [isLoading, setLoading] = useState(loading);
  useEffect(() => {
    setLoading(loading);
  }, [loading]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const refreshController = useThreadRefreshController(refreshKey);
  const liveChat = useLiveChatResponses({
    responses: responses.map((num) => ({ num })),
    scopeKey: scopeUrl,
    enabled: liveChatMode,
    isActive: active,
    isAutoRefreshEnabled: enabled,
    isFetching: isLoading,
    intervalMs: 3000,
    paused: pauseAutoScroll,
  });
  const scrollContainerRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        configureScrollContainer?.(element);
      }
    },
    [configureScrollContainer],
  );
  const { autoScrollBoundaryRef, canAutoScroll, isAutoScrolling } = useAutoRefresh({
    enabled,
    scopeUrl,
    startAtBottom,
    expired: expired || stopped || hasReachedThreadLimit,
    loading: isLoading,
    refreshController,
    pauseAutoScroll,
    pauseRefresh,
    responseCount: responses.length,
    lastResponseNum: responses.length > 0 ? responses[responses.length - 1] : null,
    rootRef,
    requestRefresh: () => {
      setLoading(true);
      onRequestRefresh();
    },
    onNewResponses,
    onAutoStop,
    deferAutoStop,
    onThreadExpired,
    onThreadExpiredDetected,
    deferExpiredStop: liveChatMode
      ? shouldDeferExpiredAutoRefreshStop({
          shouldDeferNextThreadStop: deferExpiredStop,
          expired: expired || stopped,
          hasReachedThreadLimit,
          isActive: active,
          isDraining: liveChat.isDraining,
        })
      : deferExpiredStop,
  });

  return (
    <div className="content-area">
      <div
        ref={scrollContainerRef}
        className="content-area__tab-panel"
        data-active={active ? "true" : "false"}
        data-testid="scroll-container"
      >
        <div ref={rootRef}>
          {liveChat.responses.map(({ num }) => (
            <div key={num} data-testid="response">
              {num}
            </div>
          ))}
          <div ref={autoScrollBoundaryRef} data-testid="boundary" />
          <button
            onClick={() => {
              setResponses((prev) => [...prev, prev.length + 1]);
              setLoading(false);
            }}
          >
            新着ありで完了
          </button>
          <button
            onClick={() => {
              setResponses((prev) => [...prev, prev.length + 1, prev.length + 2, prev.length + 3]);
              setLoading(false);
            }}
          >
            新着3件で完了
          </button>
          <button
            onClick={() => {
              setLoading(false);
            }}
          >
            新着なしで完了
          </button>
          <button
            onClick={() => {
              // 書き込み成功後の dispatch(RELOAD) など、hook のインターバル外から
              // 始まるリロードを再現する（requestRefresh を経由しない）。
              setLoading(true);
            }}
          >
            外部リロード開始
          </button>
          <output data-testid="can-auto-scroll">{canAutoScroll ? "enabled" : "disabled"}</output>
          <output data-testid="is-auto-scrolling">{isAutoScrolling ? "running" : "idle"}</output>
          <output data-testid="live-chat-pending">{liveChat.pendingCount}</output>
        </div>
      </div>
    </div>
  );
}

export function renderScrollableHarness(
  options: { liveChatMode?: boolean; pauseAutoScroll?: boolean } = {},
) {
  let scrollTop = 200;
  let extraHeight = 0;
  let boundaryOffset = 0;
  const onRequestRefresh = vi.fn();
  const scrollBy = vi.fn((offset: ScrollToOptions) => {
    scrollTop = Math.max(0, Math.min(scrollHeight() - 100, scrollTop + (offset.top ?? 0)));
  });
  const scrollHeight = () => 180 + screen.queryAllByTestId("response").length * 60 + extraHeight;
  render(
    <AutoRefreshHarness
      {...options}
      onRequestRefresh={onRequestRefresh}
      configureScrollContainer={(element) => {
        Object.defineProperties(element, {
          clientHeight: { configurable: true, get: () => 100 },
          scrollHeight: { configurable: true, get: scrollHeight },
          scrollTop: {
            configurable: true,
            get: () => scrollTop,
            set: (value: number) => {
              scrollTop = Math.max(0, Math.min(scrollHeight() - 100, value));
            },
          },
        });
        element.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
        mockScrollBy(element, scrollBy);
      }}
    />,
  );
  const panel = screen.getByTestId("scroll-container");
  screen.getByTestId("boundary").getBoundingClientRect = () =>
    createRect({
      top: scrollHeight() - scrollTop - 20,
      bottom: scrollHeight() - scrollTop + boundaryOffset,
    });
  act(() => {
    vi.advanceTimersByTime(0);
  });
  return {
    panel,
    scrollBy,
    scrollHeight,
    getScrollTop: () => scrollTop,
    setScrollTop: (value: number) => {
      scrollTop = value;
    },
    setExtraHeight: (value: number) => {
      extraHeight = value;
    },
    setBoundaryOffset: (value: number) => {
      boundaryOffset = value;
    },
  };
}

export interface AutoRefreshTestMocks {
  config: IConfig;
  // 呼び出しを検査する get は、config.get と式で参照すると this の束縛を外す検査の対象になるため、変数で持つ。
  configGet: Mock<(key: string) => string>;
}

function createAutoRefreshConfigMocks(): AutoRefreshTestMocks {
  const configGet = vi.fn((key: string) => {
    if (key === "auto_load_idle_stop_timeout") return "auto";
    return "3000";
  });
  return {
    configGet,
    config: {
      get: configGet,
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    },
  };
}

/**
 * 自動更新のテストで共通の前提（タイマー・rAF・ResizeObserver・設定と通信の差し替え）をそろえる。
 * 返す mocks は beforeEach のあとで作り直すため、テスト本文の中で参照する。
 */
export function setupAutoRefreshTest(): AutoRefreshTestMocks {
  const mocks = createAutoRefreshConfigMocks();

  beforeEach(() => {
    vi.useFakeTimers();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)) as typeof requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", ((id: number) =>
      window.clearTimeout(id)) as typeof cancelAnimationFrame);
    resizeObservers.length = 0;
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);

    Object.assign(mocks, createAutoRefreshConfigMocks());
    const messageMock: IMessage = {
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    container.config = mocks.config;
    container.message = messageMock;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  return mocks;
}
