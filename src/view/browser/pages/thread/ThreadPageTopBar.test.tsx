import "@testing-library/jest-dom/vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThreadPageTopBar } from "src/view/browser/pages/thread/ThreadPageTopBar";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const threadPageCss = readFileSync(resolve("src/view/browser/styles/pages/ThreadPage.css"), "utf8");

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

  it("ミニマップの予約幅で検索フィルタを狭めない", () => {
    const minimapReservationSelectors =
      threadPageCss.match(/\.thread-page--with-minimap[^{}]*(?=\{)/)?.[0] ?? "";

    expect(minimapReservationSelectors).toContain(".thread-page__notice");
    expect(minimapReservationSelectors).toContain(".thread-page__responses");
    expect(minimapReservationSelectors).toContain(".thread-page__auto-scroll-threshold");
    expect(minimapReservationSelectors).not.toContain(".thread-page__top-bar");
    expect(minimapReservationSelectors).not.toContain(".thread-page__toolbar");
  });

  it("件数と閉じるボタンを検索欄と同じ行に配置する", () => {
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

    // 件数・閉じるボタンがツールバーの直下にあると、幅不足時に検索欄とは別の行へ
    // 折り返されて3段化するため、検索欄の中に同居していることを保証する。
    const search = screen.getByPlaceholderText("検索...").closest(".thread-page__toolbar-search");
    const right = screen.getByText("3/3件").closest(".thread-page__toolbar-right");
    expect(search).not.toBeNull();
    expect(right).not.toBeNull();
    expect(search).toContainElement(right as HTMLElement);
  });

  it("狭い画面でも件数・閉じるボタンを行分離しない", () => {
    const narrowScreenBlock =
      threadPageCss.match(/@media \(max-width: 720px\) \{([\s\S]*)\}\s*$/)?.[1] ?? "";

    expect(narrowScreenBlock).toContain(".thread-page__toolbar-search");
    expect(narrowScreenBlock).toContain("min-width: 0");
    expect(narrowScreenBlock).not.toContain(".thread-page__toolbar-right");
  });
});
