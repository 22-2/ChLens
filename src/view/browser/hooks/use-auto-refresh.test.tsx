import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { container } from "src/service-container/index";
import type { IConfig, IMessage } from "src/service-container/interfaces";
import { THREAD_AUTO_REFRESH_IDLE_STOP_COUNT } from "src/view/browser/hooks/auto-refresh-config";
import { useAutoRefresh } from "src/view/browser/hooks/use-auto-refresh";
import { useThreadRefreshController } from "src/view/browser/hooks/use-thread-refresh-controller";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

interface TestRectOptions {
  top: number;
  bottom: number;
}

function createRect({ top, bottom }: TestRectOptions): DOMRect {
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

let resizeObservers: TestResizeObserver[] = [];

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

function AutoRefreshHarness({
  enabled = true,
  active = true,
  refreshKey = 0,
  pauseAutoScroll = false,
  onRequestRefresh,
  onAutoStop,
  configureScrollContainer,
}: {
  enabled?: boolean;
  active?: boolean;
  refreshKey?: number;
  pauseAutoScroll?: boolean;
  onRequestRefresh: () => void;
  onAutoStop?: () => void;
  configureScrollContainer?: (scrollContainer: HTMLDivElement) => void;
}) {
  const [responses, setResponses] = useState([1, 2]);
  const [loading, setLoading] = useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const refreshController = useThreadRefreshController(refreshKey);
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
    expired: false,
    loading,
    refreshController,
    pauseAutoScroll,
    responseCount: responses.length,
    lastResponseNum: responses.length > 0 ? responses[responses.length - 1] : null,
    rootRef,
    requestRefresh: () => {
      setLoading(true);
      onRequestRefresh();
    },
    onAutoStop,
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
          {responses.map((num) => (
            <div key={num}>{num}</div>
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
        </div>
      </div>
    </div>
  );
}

describe("useAutoRefresh", () => {
  let configMock: IConfig;
  let messageMock: IMessage;

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
    resizeObservers = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);

    configMock = {
      get: vi.fn((key: string) => {
        if (key === "auto_load_idle_stop_timeout") return "auto";
        return "3000";
      }),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    messageMock = {
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    container.config = configMock;
    container.message = messageMock;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("新着レスが来た時だけ高さ差分を scrollBy する", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    // @ts-expect-error: jsdom の HTMLElement#scrollBy は ScrollToOptions 単一引数オーバーロードを持たない
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onRequestRefresh).toHaveBeenCalledOnce();

    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
  });

  it("書き込みなど外部起因のリロードでも最下部にいれば追従スクロールする", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    // @ts-expect-error: 同上
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // hook のインターバルを経由しないリロード（書き込み成功後の RELOAD 相当）
    fireEvent.click(screen.getByText("外部リロード開始"));

    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("更新処理外のコンテンツ高さ増加でも自動追従する", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    render(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => 100,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
        }}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    // @ts-expect-error: jsdom の HTMLElement#scrollBy は ScrollToOptions 単一引数オーバーロードを持たない
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
    });

    scrollHeightValue = 360;
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("refreshKey変更時に更新前の追従位置を保存し、同じ高さ変更を二重補正しない", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    const { rerender } = render(
      <AutoRefreshHarness refreshKey={0} onRequestRefresh={onRequestRefresh} />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    // 境界はレス一覧の末尾にあるため、スクロール前は高さの増加分だけ下へ移動する。
    boundary.getBoundingClientRect = () =>
      createRect({ top: 80, bottom: scrollHeightValue - scrollTopValue });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    // @ts-expect-error: jsdom の HTMLElement#scrollBy は ScrollToOptions 単一引数オーバーロードを持たない
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // ThreadPage ではこの変更と同じ render の後に useThreadData が取得を開始する。
    // その前に layout effect が更新前の scrollHeight と追従意図を保存できることを確認する。
    act(() => {
      rerender(<AutoRefreshHarness refreshKey={1} onRequestRefresh={onRequestRefresh} />);
    });
    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // 更新完了後に ResizeObserver が通知されても、同じレス描画を再度補正しない。
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it("コンテンツ高さが縮小しても境界への追従位置を補正する", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    render(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => 100,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
        }}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    // @ts-expect-error: 同上
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
    });

    scrollHeightValue = 240;
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: -60, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("高さ変更後もユーザーのホイール操作を優先して追従しない", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 200,
      set: () => {},
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    const scrollBy = vi.fn();
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
    });

    fireEvent.wheel(scrollContainer);
    scrollHeightValue = 360;
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("アンマウント時に高さ変更の監視を解除する", () => {
    const onRequestRefresh = vi.fn();
    const { unmount } = render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    expect(resizeObservers).toHaveLength(1);
    unmount();

    expect(resizeObservers[0].disconnect).toHaveBeenCalledOnce();
  });

  it("非アクティブなパネルの高さ変更を監視しない", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness active={false} onRequestRefresh={onRequestRefresh} />);

    expect(resizeObservers).toHaveLength(0);
    expect(onRequestRefresh).not.toHaveBeenCalled();
  });

  it("自動更新を有効化した瞬間に最下部へ移動して即時 refresh する", () => {
    const onRequestRefresh = vi.fn();
    const { rerender } = render(
      <AutoRefreshHarness enabled={false} onRequestRefresh={onRequestRefresh} />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 12;
    const scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      rerender(<AutoRefreshHarness enabled={true} onRequestRefresh={onRequestRefresh} />);
    });

    expect(scrollTopValue).toBe(300);
    expect(onRequestRefresh).toHaveBeenCalledOnce();
  });

  it("更新間隔が未設定でも既定の5秒で自動更新する", () => {
    configMock = {
      get: vi.fn((key: string) => {
        if (key === "auto_load_idle_stop_timeout") return "auto";
        return "0";
      }),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.config = configMock;

    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => 300,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    scrollContainer.scrollBy = vi.fn();

    act(() => {
      vi.advanceTimersByTime(4999);
    });

    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(onRequestRefresh).toHaveBeenCalledOnce();
  });

  it("自動追従前に wheel 割り込みが入ったらユーザー操作を優先する", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn();
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
      vi.advanceTimersByTime(3000);
    });

    fireEvent.wheel(scrollContainer);
    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(onRequestRefresh).toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("自動スクロール状態を短時間維持してステータス表示に使える", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    scrollContainer.scrollBy = vi.fn();

    act(() => {
      vi.runOnlyPendingTimers();
      vi.advanceTimersByTime(3000);
    });

    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("running");

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("idle");
  });

  it("ポップアップ表示中は自動更新を継続しつつ自動スクロールだけ停止する", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} pauseAutoScroll={true} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn();
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
      vi.advanceTimersByTime(3000);
    });

    expect(onRequestRefresh).toHaveBeenCalledOnce();

    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).not.toHaveBeenCalled();
    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("idle");
  });

  it("新着が連続で来ない更新が一定回数に達したら自動停止する", () => {
    const onRequestRefresh = vi.fn();
    const onAutoStop = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} onAutoStop={onAutoStop} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 200,
      set: () => {},
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => 300,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    scrollContainer.scrollBy = vi.fn();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    // 1 回ぶんの「新着なし更新」を完了させるヘルパ。
    const runIdleRefreshCycle = () => {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.click(screen.getByText("新着なしで完了"));
      act(() => {
        vi.runOnlyPendingTimers();
      });
    };

    // 閾値の手前までは停止しない。
    for (let i = 0; i < THREAD_AUTO_REFRESH_IDLE_STOP_COUNT - 1; i += 1) {
      runIdleRefreshCycle();
    }
    expect(onAutoStop).not.toHaveBeenCalled();

    // 閾値ちょうどに達した回で停止する。
    runIdleRefreshCycle();
    expect(onAutoStop).toHaveBeenCalledOnce();
  });

  it("新着が来たらアイドル累積がリセットされ自動停止しない", () => {
    const onRequestRefresh = vi.fn();
    const onAutoStop = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} onAutoStop={onAutoStop} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 200,
      set: () => {},
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => 300,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    scrollContainer.scrollBy = vi.fn();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    const runRefreshCycle = (completeButtonLabel: string) => {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.click(screen.getByText(completeButtonLabel));
      act(() => {
        vi.runOnlyPendingTimers();
      });
    };

    // あと 1 回で閾値に届く所まで idle を積む。
    for (let i = 0; i < THREAD_AUTO_REFRESH_IDLE_STOP_COUNT - 1; i += 1) {
      runRefreshCycle("新着なしで完了");
    }

    // 新着が来たら累積がリセットされるので、ここでは止まらない。
    runRefreshCycle("新着ありで完了");
    expect(onAutoStop).not.toHaveBeenCalled();

    // リセット後はまた閾値ぶん idle が必要。手前までは止まらない。
    for (let i = 0; i < THREAD_AUTO_REFRESH_IDLE_STOP_COUNT - 1; i += 1) {
      runRefreshCycle("新着なしで完了");
    }
    expect(onAutoStop).not.toHaveBeenCalled();
  });
});
