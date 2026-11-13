import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { useManualPauseStore } from "src/features/auto-refresh/browser/manual-pause-store";
import { ThreadScrollFloatingActions } from "src/features/thread/ui/ThreadScrollFloatingActions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

function createRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 100,
    right: 900,
    bottom: 600,
    width: 800,
    height: 600,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("ThreadScrollFloatingActions", () => {
  let scrollTop = 300;
  let scrollHeight = 500;

  beforeEach(() => {
    useManualPauseStore.setState({ paused: {} });
    scrollTop = 300;
    scrollHeight = 500;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderActions(isAutoRefreshEnabled = false, readOnly = false, loading = false) {
    const panel = document.createElement("div");
    panel.className = "content-area__tab-panel";
    panel.dataset.active = "true";
    const root = document.createElement("div");
    root.className = "thread-page";
    root.style.setProperty("--thread-minimap-width", "90px");
    panel.append(root);
    document.body.append(panel);

    Object.defineProperties(panel, {
      clientHeight: {
        configurable: true,
        get: () => 200,
      },
      scrollHeight: {
        configurable: true,
        get: () => scrollHeight,
      },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    panel.getBoundingClientRect = createRect;
    const scrollTo = vi.fn((options: ScrollToOptions) => {
      const { top } = options;
      scrollTop = top ?? scrollTop;
    });
    Object.defineProperty(panel, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    const rootRef = { current: root } as React.RefObject<HTMLDivElement | null>;
    const onEnableAutoRefresh = vi.fn();
    const result = render(
      <ThreadScrollFloatingActions
        rootRef={rootRef}
        tabId="test-tab"
        threadUrl="https://example.com/thread"
        isNextThreadWaiting={false}
        isActive
        isAutoRefreshEnabled={isAutoRefreshEnabled}
        canAutoRefresh={!readOnly}
        isFilterEnabled={false}
        loading={loading}
        expired={false}
        responseCount={10}
        onEnableAutoRefresh={onEnableAutoRefresh}
      />,
    );

    return { onEnableAutoRefresh, panel, result, scrollTo };
  }

  it("上下移動と自動更新を同じ場所に表示する", () => {
    const { onEnableAutoRefresh } = renderActions();

    const button = screen.getByRole("button", { name: "自動読み込みを開始" });
    expect(button).toBeInTheDocument();
    expect(button.closest('[role="toolbar"]')).toHaveStyle({ left: "808px" });
    expect(button.querySelector(".lucide-play")).toBeInTheDocument();
    expect(button.textContent).toBe("");
    fireEvent.click(button);
    expect(onEnableAutoRefresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "下へジャンプ" })).toBeInTheDocument();
  });

  it("過去ログのポリシーで自動更新不可なら開始ボタンを表示しない", () => {
    renderActions(false, true);

    expect(screen.queryByRole("button", { name: "自動読み込みを開始" })).toBeNull();
  });

  it("自動更新が許可されない場合もスクロール用のボタンは使える", () => {
    scrollTop = 0;
    renderActions(false, true);
    expect(screen.getByRole("button", { name: "下へジャンプ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "自動読み込みを開始" })).not.toBeInTheDocument();
  });

  it("最下部から大きく上ではミニマップの左側に下へジャンプを表示する", () => {
    scrollTop = 0;
    const { scrollTo } = renderActions();

    const button = screen.getByRole("button", { name: "下へジャンプ" });
    expect(button).toBeInTheDocument();
    expect(button.closest('[role="toolbar"]')).toHaveStyle({ left: "808px" });

    fireEvent.click(button);
    expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "auto" });
  });

  it("スクロール位置が変わっても操作ボタンの場所を維持する", () => {
    scrollTop = 250;
    const { panel } = renderActions();

    expect(screen.getByRole("button", { name: "下へジャンプ" })).toBeInTheDocument();
    scrollTop = 297;
    fireEvent.scroll(panel);
    expect(screen.getByRole("button", { name: "下へジャンプ" })).toBeInTheDocument();
    scrollTop = 300;
    fireEvent.scroll(panel);

    expect(screen.getByRole("button", { name: "下へジャンプ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "自動読み込みを開始" })).toBeInTheDocument();
  });

  it("自動更新中は同じ状態を使って一時停止と再開を切り替える", () => {
    renderActions(true);

    expect(screen.queryByRole("button", { name: "自動読み込みを開始" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "自動更新を一時停止" }));
    expect(screen.getByRole("button", { name: "自動更新を再開" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "自動更新を再開" }));
    expect(screen.getByRole("button", { name: "自動更新を一時停止" })).toBeInTheDocument();
  });

  it("自動更新中の読み込みでは上へジャンプを表示し続ける", () => {
    renderActions(true, false, true);

    expect(screen.getByRole("button", { name: "上へジャンプ" })).toBeInTheDocument();
  });

  it("読み込み中は自動読み込み開始を無効にし、上へジャンプは残す", () => {
    scrollTop = 500;
    renderActions(false, false, true);

    expect(screen.getByRole("button", { name: "自動読み込みを開始" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "上へジャンプ" })).toBeInTheDocument();
  });

  it("ハンドルを上下キーで移動できる", () => {
    renderActions();
    const toolbar = screen.getByRole("toolbar", { name: "スレッド操作" });
    const before = Number.parseFloat(toolbar.style.top);
    fireEvent.keyDown(screen.getByRole("button", { name: "ツールバーを移動" }), {
      key: "ArrowDown",
    });
    expect(Number.parseFloat(toolbar.style.top)).toBeGreaterThan(before);
  });
});
