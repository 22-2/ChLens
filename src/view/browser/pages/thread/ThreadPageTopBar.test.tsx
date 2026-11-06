import "@testing-library/jest-dom/vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThreadPageTopBar } from "src/view/browser/pages/thread/ThreadPageTopBar";
import { DEFAULT_SEARCH_OPTIONS } from "src/view/browser/utils/search-normalize";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const COUNTS = {
  internalLink: 1,
  own: 4,
  popular: 2,
  image: 3,
  video: 0,
  link: 9,
};

const threadPageCss = readFileSync(resolve("src/view/browser/styles/pages/ThreadPage.css"), "utf8");

type BarProps = React.ComponentProps<typeof ThreadPageTopBar>;

function renderBar(overrides: Partial<BarProps> = {}) {
  const props: BarProps = {
    activeTopBar: "filter",
    filter: "all",
    filterCounts: COUNTS,
    onClose: vi.fn(),
    onFilterChange: vi.fn(),
    onSearchQueryChange: vi.fn(),
    onSearchOptionsChange: vi.fn(),
    searchFocusKey: 0,
    searchQuery: "",
    searchOptions: DEFAULT_SEARCH_OPTIONS,
    ...overrides,
  };
  render(<ThreadPageTopBar {...props} />);
  return props;
}

describe("ThreadPageTopBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("絞り込み前は人気ボタンと種類メニューを出す", () => {
    renderBar();

    expect(screen.getByPlaceholderText("フィルタする文字を入力")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "人気" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "フィルタの種類" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("初回フォーカスを抑える指定のときは入力欄へフォーカスしない", () => {
    renderBar({ suppressInitialFocus: true });

    expect(screen.getByPlaceholderText("フィルタする文字を入力")).not.toHaveFocus();
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

  it("絞り込みメニューに種類を件数つきで並べる", () => {
    renderBar({ filter: "popular" });

    fireEvent.click(screen.getByRole("button", { name: "フィルタの種類" }));

    // アイコン（かなのアイコンは文字を含む）を除き、ラベルだけを比べる。
    const labels = screen
      .getAllByRole("menuitemcheckbox")
      .map((item) => item.querySelector(".context-menu__label")?.textContent);
    expect(labels).toEqual([
      "すべて",
      "人気 (2)",
      "画像 (3)",
      "動画 (0)",
      "外部リンク (9)",
      "内部リンク (1)",
      "自分のレス (4)",
    ]);
    expect(screen.getByRole("menuitemcheckbox", { name: "人気 (2)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("種類を選ぶと親へ通知し、選んでいる種類をもう一度選ぶと解除する", () => {
    const props = renderBar({ filter: "image" });

    fireEvent.click(screen.getByRole("button", { name: "フィルタの種類" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "自分のレス (4)" }));
    expect(props.onFilterChange).toHaveBeenLastCalledWith("own");

    fireEvent.click(screen.getByRole("button", { name: "フィルタの種類" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "画像 (3)" }));
    expect(props.onFilterChange).toHaveBeenLastCalledWith("all");
  });

  it("種類ボタンを一度押すと有効になり、再度押すと解除し、種類を記憶する", () => {
    const onFilterChange = vi.fn();
    const props: BarProps = {
      activeTopBar: "filter",
      filter: "all",
      filterCounts: COUNTS,
      onClose: vi.fn(),
      onFilterChange,
      onSearchQueryChange: vi.fn(),
      onSearchOptionsChange: vi.fn(),
      searchFocusKey: 0,
      searchQuery: "",
      searchOptions: DEFAULT_SEARCH_OPTIONS,
    };
    const { rerender } = render(<ThreadPageTopBar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "人気" }));
    expect(onFilterChange).toHaveBeenLastCalledWith("popular");
    rerender(<ThreadPageTopBar {...props} filter="image" />);
    fireEvent.click(screen.getByRole("button", { name: "画像" }));
    expect(onFilterChange).toHaveBeenLastCalledWith("all");
    rerender(<ThreadPageTopBar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "画像" }));
    expect(onFilterChange).toHaveBeenLastCalledWith("image");
  });

  it("種類を選んでいる間は、閉じていても選んだ種類をボタンに出して強調する", () => {
    renderBar({ filter: "video" });

    expect(screen.getByRole("button", { name: "動画" })).toHaveAttribute("data-active", "true");
  });

  it("検索の条件の切り替えを親へ通知する", () => {
    const props = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "検索の条件" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "正規表現" }));

    expect(props.onSearchOptionsChange).toHaveBeenCalledWith({
      ...DEFAULT_SEARCH_OPTIONS,
      regex: true,
    });
  });

  it("検索語が読めないときは、入力欄に不正を示し、理由を説明に出す", () => {
    renderBar({ searchQuery: "date:abc", searchError: "日付「abc」を読み取れません" });

    const input = screen.getByPlaceholderText("フィルタする文字を入力");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("title", "日付「abc」を読み取れません");
  });

  it("入力中にEscapeを押すと入力欄を空にし、バーは開いたままにする", () => {
    const props = renderBar({ searchQuery: "abc" });

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

    expect(props.onSearchQueryChange).toHaveBeenLastCalledWith("");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("入力欄が空のままEscapeを押すとバーを閉じる", () => {
    const props = renderBar();

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSearchQueryChange).not.toHaveBeenCalled();
  });
});
