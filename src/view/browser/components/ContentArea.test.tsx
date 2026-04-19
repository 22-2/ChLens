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

function mockState(currentPage: Page, activeTab: Tab) {
  mockUseTabStore.mockReturnValue({ currentPage, activeTab });
}

describe("ContentArea scroll restoration", () => {
  beforeEach(() => {
    mockUseTabStore.mockReset();
  });

  it("タブ切り替え時に content-area の scroll 位置を復元する", () => {
    const homePage: Page = { type: "home", title: "ホーム" };
    const tab1 = createTab("tab-1");
    const tab2 = createTab("tab-2");

    mockState(homePage, tab1);
    const { container, rerender } = render(<ContentArea />);

    const contentArea = container.querySelector(".content-area") as HTMLDivElement;
    contentArea.scrollTop = 240;
    contentArea.scrollLeft = 18;

    mockState(homePage, tab2);
    rerender(<ContentArea />);

    expect(contentArea.scrollTop).toBe(0);
    expect(contentArea.scrollLeft).toBe(0);

    contentArea.scrollTop = 84;

    mockState(homePage, tab1);
    rerender(<ContentArea />);

    expect(contentArea.scrollTop).toBe(240);
    expect(contentArea.scrollLeft).toBe(18);
  });
});
