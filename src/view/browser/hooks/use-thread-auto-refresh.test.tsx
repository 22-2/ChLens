import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { container } from "src/service-container/index";
import type { IConfig, IMessage } from "src/service-container/interfaces";
import {
  AutoScrollStateProvider,
  useAutoScrollState,
} from "src/view/browser/hooks/use-auto-scroll-state";
import { useThreadAutoRefresh } from "src/view/browser/hooks/use-thread-auto-refresh";
import { useThreadRefreshController } from "src/view/browser/hooks/use-thread-refresh-controller";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

function ThreadProbe({
  enabled,
  pauseAutoScroll,
}: {
  enabled: boolean;
  pauseAutoScroll?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const refreshController = useThreadRefreshController(0);
  const { autoScrollBoundaryRef, intervalMs } = useThreadAutoRefresh({
    enabled,
    threadUrl: "https://example.com/test/read.cgi/board/1/",
    refreshController,
    expired: false,
    loading: false,
    responseCount: 1,
    lastResponseNum: 1,
    rootRef,
    requestRefresh: vi.fn(),
    pauseAutoScroll,
  });
  return (
    <div className="content-area">
      <div className="content-area__tab-panel" data-active="true">
        <div ref={rootRef}>
          <div ref={autoScrollBoundaryRef} />
          <output data-testid="interval">{intervalMs}</output>
        </div>
      </div>
    </div>
  );
}

function StateReader() {
  const state = useAutoScrollState();
  return <output data-testid="state">{JSON.stringify(state)}</output>;
}

function renderWithProvider(props: { enabled: boolean; pauseAutoScroll?: boolean }) {
  return render(
    <AutoScrollStateProvider>
      <ThreadProbe {...props} />
      <StateReader />
    </AutoScrollStateProvider>,
  );
}

function readState() {
  return JSON.parse(screen.getByTestId("state").textContent ?? "{}") as Record<string, boolean>;
}

describe("useThreadAutoRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("ResizeObserver", undefined);
    const config: IConfig = {
      get: vi.fn((key: string) => (key === "auto_load_second" ? "7000" : null)),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    const message: IMessage = { send: vi.fn(), on: vi.fn(), off: vi.fn() };
    container.config = config;
    container.message = message;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("無効な間はステータスバー向けの状態をすべて false にする", () => {
    renderWithProvider({ enabled: false, pauseAutoScroll: true });
    expect(readState()).toEqual({ canAutoScroll: false, isAutoScrolling: false, isPaused: false });
  });

  it("有効な間は追従の一時停止をステータスバーへ伝える", () => {
    renderWithProvider({ enabled: true, pauseAutoScroll: true });
    expect(readState().isPaused).toBe(true);
  });

  it("pauseAutoScroll を省略すると一時停止しない", () => {
    renderWithProvider({ enabled: true });
    expect(readState().isPaused).toBe(false);
  });

  it("スレッドURLから自動更新間隔を読む", () => {
    renderWithProvider({ enabled: false });
    expect(screen.getByTestId("interval")).toHaveTextContent("7000");
  });
});
