import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NavigationBar } from "src/view/browser/components/NavigationBar";
import { afterEach, describe, expect, it, vi } from "vitest";

const { activeTab, dispatchMock, longTitle } = vi.hoisted(() => {
  const longTitle = "かなり長い履歴タイトル".repeat(12);
  const activeTab = {
    id: "tab-1",
    history: [
      {
        type: "threadList" as const,
        title: longTitle,
        boardUrl: "https://egg.5ch.net/software/",
        boardTitle: "Software",
      },
      {
        type: "thread" as const,
        title: "Current Thread",
        threadUrl: "https://egg.5ch.net/test/read.cgi/software/1/",
      },
    ],
    currentIndex: 1,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshThreadUrl: null,
  };

  return {
    activeTab,
    dispatchMock: vi.fn(),
    longTitle,
  };
});

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    state: { tabs: [activeTab] },
    activeTab,
    currentPage: activeTab.history[activeTab.currentIndex],
    dispatch: dispatchMock,
  }),
}));

describe("NavigationBar", () => {
  afterEach(() => {
    cleanup();
    dispatchMock.mockReset();
  });

  it("戻る履歴メニューのタイトルを複数行表示にする", () => {
    render(<NavigationBar />);

    fireEvent.contextMenu(screen.getByTitle("戻る"));

    const item = screen.getByRole("button", { name: longTitle });
    const label = document.querySelector(
      ".context-menu__label--multiline",
    ) as HTMLSpanElement;

    expect(item).toHaveClass("context-menu__item--multiline");
    expect(label).toHaveTextContent(longTitle);
  });
});
