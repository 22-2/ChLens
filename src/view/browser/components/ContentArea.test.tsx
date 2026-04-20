import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Page, Tab } from "src/view/browser/types";
import { ContentArea } from "src/view/browser/components/ContentArea";

const mockUseTabStore = vi.fn();

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => mockUseTabStore(),
}));

vi.mock("src/view/browser/pages/HomePage", () => ({
  HomePage: () => <div data-testid="page-home" style={{ height: "2400px" }}>home</div>,
}));

vi.mock("src/view/browser/pages/BoardListPage", () => ({
  BoardListPage: () => <div data-testid="page-board-list">board-list</div>,
}));

vi.mock("src/view/browser/pages/SettingsPage", () => ({
  SettingsPage: () => <div data-testid="page-settings">settings</div>,
}));

vi.mock("src/view/browser/pages/ThreadListPage", () => ({
  ThreadListPage: () => <div data-testid="page-thread-list">thread-list</div>,
}));

vi.mock("src/view/browser/pages/ThreadPage", () => ({
  ThreadPage: () => <div data-testid="page-thread">thread</div>,
}));

function createTab(id: string): Tab {
  return {
    id,
    history: [{ type: "home", title: "ホーム" }],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshThreadUrl: null,
  };
}

function createTabWithPage(id: string, page: Page): Tab {
  return {
    ...createTab(id),
    history: [page],
    currentIndex: 0,
  };
}

function mockState(tabs: Tab[], activeTabId: string) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) as Tab;
  mockUseTabStore.mockReturnValue({
    state: {
      tabs,
      activeTabId,
      closedTabs: [],
    },
    activeTab,
    currentPage: activeTab.history[activeTab.currentIndex],
    dispatch: vi.fn(),
  });
}

describe("ContentArea tab switching", () => {
  beforeEach(() => {
    mockUseTabStore.mockReset();
  });

  it("アクティブでないタブは display:none で隠す", () => {
    const tab1 = createTabWithPage("tab-1", {
      type: "home",
      title: "ホーム",
    });
    const tab2 = createTabWithPage("tab-2", {
      type: "boardList",
      title: "板一覧",
    });

    mockState([tab1, tab2], "tab-1");
    const { container, rerender } = render(<ContentArea />);

    const panel1 = container.querySelector(
      '[data-tab-panel-id="tab-1"]',
    ) as HTMLDivElement;
    const panel2 = container.querySelector(
      '[data-tab-panel-id="tab-2"]',
    ) as HTMLDivElement;

    expect(panel1).toHaveStyle({ display: "block" });
    expect(panel2).toHaveStyle({ display: "none" });

    mockState([tab1, tab2], "tab-2");
    rerender(<ContentArea />);

    expect(panel1).toHaveStyle({ display: "none" });
    expect(panel2).toHaveStyle({ display: "block" });
  });

  it("非アクティブ化してもタブごとの scroll 状態を保持する", () => {
    const tab1 = createTabWithPage("tab-1", {
      type: "home",
      title: "ホーム",
    });
    const tab2 = createTabWithPage("tab-2", {
      type: "boardList",
      title: "板一覧",
    });

    mockState([tab1, tab2], "tab-1");
    const { container, rerender } = render(<ContentArea />);

    const panel1 = container.querySelector(
      '[data-tab-panel-id="tab-1"]',
    ) as HTMLDivElement;
    const panel2 = container.querySelector(
      '[data-tab-panel-id="tab-2"]',
    ) as HTMLDivElement;

    panel1.scrollTop = 240;
    panel2.scrollTop = 32;

    mockState([tab1, tab2], "tab-2");
    rerender(<ContentArea />);

    mockState([tab1, tab2], "tab-1");
    rerender(<ContentArea />);

    expect(panel1.scrollTop).toBe(240);
    expect(panel2.scrollTop).toBe(32);
  });
});
