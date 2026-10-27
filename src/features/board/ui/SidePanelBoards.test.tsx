import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SidePanelBoards } from "src/features/board/ui/SidePanelBoards";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), update: vi.fn() }));
vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({ dispatch: mocks.dispatch }),
}));
vi.mock("src/features/board/browser/use-board-list-logic", () => ({
  useBoardListLogic: () => ({
    loading: false,
    error: null,
    openStates: { メニュー: true, "メニュー:カテゴリ": true },
    updateOpenStates: mocks.update,
  }),
}));
vi.mock("src/features/board/browser/use-board-list-display", () => ({
  useBoardListDisplay: () => ({
    searchQuery: "",
    setSearchQuery: vi.fn(),
    displayMenus: [
      {
        name: "メニュー",
        categories: [
          {
            name: "カテゴリ",
            boards: [{ name: "サンプル板", url: "https://example.com/sample/" }],
          },
        ],
      },
    ],
  }),
}));

describe("サイドパネルの板一覧", () => {
  afterEach(() => {
    cleanup();
    mocks.dispatch.mockClear();
  });
  it("板を選ぶと現在のペインに開く", () => {
    render(<SidePanelBoards tabId="tab" />);
    fireEvent.click(screen.getByRole("button", { name: "サンプル板" }));
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "NAVIGATE",
        page: expect.objectContaining({ boardTitle: "サンプル板" }),
      }),
    );
  });
  it("中クリックではバックグラウンドのタブに開く", () => {
    render(<SidePanelBoards tabId="tab" />);
    fireEvent(
      screen.getByRole("button", { name: "サンプル板" }),
      new MouseEvent("auxclick", { button: 1, bubbles: true }),
    );
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "OPEN_IN_NEW_TAB", background: true }),
    );
  });
});
