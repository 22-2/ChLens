import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NgBadge } from "src/view/browser/components/NgBadge";
import { describe, expect, it } from "vite-plus/test";

describe("NgBadge", () => {
  it("ホバー時に一致したNGルールを共通ツールチップで表示する", async () => {
    render(
      <NgBadge result={{ type: "Body", ruleDescription: "hide body contains:\n  対象ワード" }} />,
    );

    const badge = screen.getByText("NG");
    expect(badge).not.toHaveAttribute("title");

    fireEvent.pointerMove(badge);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "NGルール hide body contains: 対象ワード",
    );
  });
});
