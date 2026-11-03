import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  getSearchError,
  SearchOptionToggles,
} from "src/view/browser/components/SearchOptionToggles";
import { DEFAULT_SEARCH_OPTIONS } from "src/view/browser/utils/search-normalize";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(cleanup);

describe("SearchOptionToggles", () => {
  it("3つの切り替えを押下状態つきで出す", () => {
    render(
      <SearchOptionToggles
        options={{ ...DEFAULT_SEARCH_OPTIONS, regex: true }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "大文字と小文字を区別" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "ひらがなとカタカナを区別" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "正規表現" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("押した項目だけを反転して通知する", () => {
    const onChange = vi.fn();
    render(<SearchOptionToggles options={DEFAULT_SEARCH_OPTIONS} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "ひらがなとカタカナを区別" }));

    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SEARCH_OPTIONS, kanaSensitive: true });
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
