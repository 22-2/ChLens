import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { BottomPanel } from "src/view/browser/components/BottomPanel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  closePanel: vi.fn(),
  canAutoScroll: false,
  isAutoScrolling: false,
  currentPage: {
    type: "thread",
    title: "スレッド",
    threadUrl: "https://example.com/test/read.cgi/software/1/",
  },
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({ currentPage: mocks.currentPage }),
}));

vi.mock("src/view/browser/hooks/use-bottom-panel", () => ({
  useBottomPanel: () => ({
    isOpen: true,
    height: 200,
    activeTabId: "write",
    tabs: [{ id: "write", label: "書き込み" }],
    openPanel: vi.fn(),
    closePanel: mocks.closePanel,
    togglePanel: vi.fn(),
    setHeight: vi.fn(),
    setActiveTab: vi.fn(),
  }),
}));

vi.mock("src/view/browser/hooks/use-auto-scroll-state", () => ({
  useAutoScrollState: () => ({
    canAutoScroll: mocks.canAutoScroll,
    isAutoScrolling: mocks.isAutoScrolling,
    isPaused: false,
  }),
}));

vi.mock("src/view/browser/components/WritePanelContent", () => ({
  WritePanelContent: () => <div>write panel</div>,
}));

describe("BottomPanel", () => {
  beforeEach(() => {
    mocks.closePanel.mockReset();
    mocks.canAutoScroll = false;
    mocks.isAutoScrolling = false;
    mocks.currentPage = {
      type: "thread",
      title: "スレッド",
      threadUrl: "https://example.com/test/read.cgi/software/1/",
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("スレッドでは書き込みパネルを表示する", () => {
    render(<BottomPanel />);

    expect(screen.getByText("write panel")).toBeInTheDocument();
    expect(mocks.closePanel).not.toHaveBeenCalled();
  });

  it("スレッド以外へ移動したらパネルを閉じて非表示にする", async () => {
    mocks.currentPage = {
      type: "home",
      title: "ホーム",
    };

    render(<BottomPanel />);

    await waitFor(() => {
      expect(mocks.closePanel).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("write panel")).not.toBeInTheDocument();
  });

  it("自動追従有効中にパネルが開いてもスレッド末尾へ同期する", () => {
    mocks.canAutoScroll = true;

    const scrollContainer = document.createElement("div");
    scrollContainer.className = "content-area__tab-panel";
    scrollContainer.setAttribute("data-active", "true");

    let scrollTopValue = 10;
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => 480,
    });

    document.body.appendChild(scrollContainer);

    render(<BottomPanel />);

    expect(scrollTopValue).toBe(480);
    scrollContainer.remove();
  });
});
