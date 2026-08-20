import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MenuAccordion } from "src/view/browser/pages/board-list/MenuAccordion";
import { describe, expect, it, vi } from "vite-plus/test";

const menus = [
  {
    name: "メニューA",
    categories: [
      {
        name: "カテゴリA",
        boards: [{ name: "板A", url: "https://example.com/a" }],
      },
    ],
  },
];

describe("MenuAccordion", () => {
  it("Radix Accordionの開閉値を上位へ返し、板クリックを維持する", () => {
    const onMenuAccordionChange = vi.fn();
    const onBoardClick = vi.fn();

    render(
      <MenuAccordion
        menus={menus}
        openStates={{ "メニューA:カテゴリA": true }}
        openedMenuValues={["メニューA"]}
        onMenuAccordionChange={onMenuAccordionChange}
        onCategoryAccordionChange={vi.fn()}
        onBoardClick={onBoardClick}
        onBoardMiddleClick={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "メニューA" }));
    expect(onMenuAccordionChange).toHaveBeenCalledWith([]);

    fireEvent.mouseDown(screen.getByRole("button", { name: "板A" }));
    expect(onBoardClick).toHaveBeenCalledWith("https://example.com/a", "板A");
  });
});
