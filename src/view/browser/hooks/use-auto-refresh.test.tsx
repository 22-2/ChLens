import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IConfig, IMessage } from "src/service-container/interfaces";
import { container } from "src/service-container/index";
import { useAutoRefresh } from "src/view/browser/hooks/use-auto-refresh";

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

function AutoRefreshHarness({
  enabled = true,
  onRequestRefresh,
}: {
  enabled?: boolean;
  onRequestRefresh: () => void;
}) {
  const [responses, setResponses] = useState([1, 2]);
  const [loading, setLoading] = useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const { autoScrollBoundaryRef, canAutoScroll, isAutoScrolling } =
    useAutoRefresh({
      enabled,
      expired: false,
      loading,
      responseCount: responses.length,
      lastResponseNum: responses.length > 0 ? responses[responses.length - 1] : null,
      rootRef,
      requestRefresh: () => {
        setLoading(true);
        onRequestRefresh();
      },
    });

  return (
    <div className="content-area" data-testid="scroll-container">
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
        <output data-testid="can-auto-scroll">
          {canAutoScroll ? "enabled" : "disabled"}
        </output>
        <output data-testid="is-auto-scrolling">
          {isAutoScrolling ? "running" : "idle"}
        </output>
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

    vi.stubGlobal(
      "requestAnimationFrame",
      ((callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 0)) as typeof requestAnimationFrame,
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      ((id: number) => window.clearTimeout(id)) as typeof cancelAnimationFrame,
    );

    configMock = {
      get: vi.fn(() => "3000"),
      set: vi.fn(),
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
    scrollContainer.getBoundingClientRect = () =>
      createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    // @ts-expect-error
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
    scrollContainer.getBoundingClientRect = () =>
      createRect({ top: 0, bottom: 100 });
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
});
