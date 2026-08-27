import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ThreadPageTopBar } from "src/view/browser/pages/thread/ThreadPageTopBar";

describe("ThreadPageTopBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("検索欄の左端に検索対象を表示し、初期値をすべてにする", () => {
    render(
      <ThreadPageTopBar
        activeTopBar="filter"
        filter="all"
        filteredResponseCount={3}
        onClose={vi.fn()}
        onFilterChange={vi.fn()}
        onSearchTargetChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        responseCount={3}
        searchFocusKey={0}
        searchQuery=""
        searchTarget="all"
      />,
    );

    const searchTarget = screen.getByRole("combobox", { name: "検索対象" });
    expect(searchTarget).toHaveValue("all");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "すべて",
      "本文",
      "名前",
      "ID",
    ]);
  });

  it("検索対象の変更を親へ通知する", () => {
    const onSearchTargetChange = vi.fn();
    render(
      <ThreadPageTopBar
        activeTopBar="filter"
        filter="all"
        filteredResponseCount={0}
        onClose={vi.fn()}
        onFilterChange={vi.fn()}
        onSearchTargetChange={onSearchTargetChange}
        onSearchQueryChange={vi.fn()}
        responseCount={0}
        searchFocusKey={0}
        searchQuery=""
        searchTarget="all"
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "検索対象" }), {
      target: { value: "name" },
    });

    expect(onSearchTargetChange).toHaveBeenCalledWith("name");
  });
});
