import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import {
  StatusBar,
  StatusBarItem,
  StatusBarMode,
  StatusBarProvider,
} from "src/view/browser/components/StatusBar";
import { describe, expect, it } from "vitest";

describe("StatusBar", () => {
  it("左右にアイテムを登録でき、appearanceも切り替えられる", () => {
    render(
      <StatusBarProvider>
        <StatusBarItem id="left-item" alignment="left" priority={10}>
          <span>左側</span>
        </StatusBarItem>
        <StatusBarItem id="right-item" alignment="right" priority={10}>
          <span>右側</span>
        </StatusBarItem>
        <StatusBarMode id="active-mode" appearance="active" />
        <StatusBar />
      </StatusBarProvider>,
    );

    const statusBar = screen.getByRole("contentinfo");
    expect(statusBar).toHaveClass("status-bar--active");

    const groups = statusBar.querySelectorAll(".status-bar__group");
    expect(groups[0]).toHaveTextContent("左側");
    expect(groups[1]).toHaveTextContent("右側");
  });
});
