import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { BoardListContent } from "src/view/browser/pages/board-list/BoardListContent";
import { describe, expect, it, vi } from "vite-plus/test";

describe("BoardListContent", () => {
  it("板一覧の初回読み込み中はスピナーを表示する", () => {
    render(
      <BoardListContent
        loading
        error={null}
        displayMenus={[]}
        openStates={{}}
        openedMenuValues={[]}
        onMenuAccordionChange={vi.fn()}
        onCategoryAccordionChange={vi.fn()}
        onBoardClick={vi.fn()}
        onBoardMiddleClick={vi.fn()}
        onContextMenu={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("status", { name: "板一覧を読み込み中" })).toBeInTheDocument();
    expect(screen.getByText("板一覧を読み込み中...")).toBeInTheDocument();
  });
});
