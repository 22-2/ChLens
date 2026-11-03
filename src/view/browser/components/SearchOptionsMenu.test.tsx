import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getSearchError, SearchOptionsMenu } from "src/view/browser/components/SearchOptionsMenu";
import { DEFAULT_SEARCH_OPTIONS } from "src/view/browser/utils/search-normalize";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(cleanup);

describe("SearchOptionsMenu", () => {
  it("閉じている間は項目を出さず、押すと3つのチェック項目を押下状態つきで出す", () => {
    render(
      <SearchOptionsMenu options={{ ...DEFAULT_SEARCH_OPTIONS, regex: true }} onChange={vi.fn()} />,
    );
    expect(screen.queryByRole("menuitemcheckbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "検索の条件" }));

    expect(screen.getByRole("menuitemcheckbox", { name: "大文字と小文字を区別" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(
      screen.getByRole("menuitemcheckbox", { name: "ひらがなとカタカナを区別" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("menuitemcheckbox", { name: "正規表現" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("選んだ項目だけを反転して通知する", () => {
    const onChange = vi.fn();
    render(<SearchOptionsMenu options={DEFAULT_SEARCH_OPTIONS} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "検索の条件" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "ひらがなとカタカナを区別" }));

    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SEARCH_OPTIONS, kanaSensitive: true });
  });

  it("既定から外れた条件があるときは、閉じたままでも強調する", () => {
    const { rerender } = render(
      <SearchOptionsMenu options={DEFAULT_SEARCH_OPTIONS} onChange={vi.fn()} />,
    );
    const button = screen.getByRole("button", { name: "検索の条件" });
    expect(button).not.toHaveAttribute("data-active");

    rerender(
      <SearchOptionsMenu
        options={{ ...DEFAULT_SEARCH_OPTIONS, caseSensitive: true }}
        onChange={vi.fn()}
      />,
    );
    expect(button).toHaveAttribute("data-active", "true");
  });

  it("先頭の項目を渡すと、文字つきのボタンで検索の条件の前に並べる", () => {
    const onSelect = vi.fn();
    render(
      <SearchOptionsMenu
        options={DEFAULT_SEARCH_OPTIONS}
        onChange={vi.fn()}
        label="絞り込み"
        leadingItems={[{ id: "image", label: "画像", checked: false, onSelect }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "絞り込み" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "画像" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("getSearchError", () => {
  it("正規表現が不正なときだけ理由を返す", () => {
    const regex = { ...DEFAULT_SEARCH_OPTIONS, regex: true };
    expect(getSearchError("(", regex)).toEqual(expect.any(String));
    expect(getSearchError("(", DEFAULT_SEARCH_OPTIONS)).toBeNull();
    expect(getSearchError("a(b)", regex)).toBeNull();
    expect(getSearchError("", regex)).toBeNull();
  });
});
