import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ThreadScrollFloatingActions } from "src/view/browser/components/ThreadScrollFloatingActions";
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

  function renderActions(isAutoRefreshEnabled = false) {
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
        isActive
        isAutoRefreshEnabled={isAutoRefreshEnabled}
        isFilterEnabled={false}
        loading={false}
        expired={false}
        responseCount={10}
        onEnableAutoRefresh={onEnableAutoRefresh}
      />,
    );

    return { onEnableAutoRefresh, panel, result, scrollTo };
  }

  it("最下部では自動読み込みボタンを表示する", () => {
    const { onEnableAutoRefresh } = renderActions();

    const button = screen.getByRole("button", { name: "自動読み込みを開始" });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onEnableAutoRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "下へジャンプ" })).not.toBeInTheDocument();
  });

  it("最下部から少し上ではミニマップの左側に下へジャンプを表示する", () => {
    scrollTop = 250;
    const { scrollTo } = renderActions();

    const button = screen.getByRole("button", { name: "下へジャンプ" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveStyle({ left: "802px" });

    fireEvent.click(button);
    expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "auto" });
  });

  it("自動更新中は開始ボタンを重ねて表示しない", () => {
    renderActions(true);

    expect(screen.queryByRole("button", { name: "自動読み込みを開始" })).not.toBeInTheDocument();
  });
});
