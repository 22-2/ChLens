import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useThreadTopBar } from "src/view/browser/pages/thread/use-thread-top-bar";

function TopBarHarness() {
  const [searchQuery, setSearchQuery] = useState("");
  const { activeTopBar, closeTopBar, searchFocusKey } = useThreadTopBar({
    searchQuery,
    setSearchQuery,
  });

  return (
    <div>
      <output data-testid="active-top-bar">{activeTopBar}</output>
      <output data-testid="search-focus-key">{searchFocusKey}</output>
      <output data-testid="search-query">{searchQuery}</output>
      <button onClick={() => setSearchQuery("abc")}>set query</button>
      <button onClick={closeTopBar}>close</button>
    </div>
  );
}

describe("useThreadTopBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("検索イベントでフィルタバーを開いて検索focusキーを更新する", () => {
    render(<TopBarHarness />);

    act(() => {
      window.dispatchEvent(new window.CustomEvent("thread-search-toggle"));
    });

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("filter");
    expect(screen.getByTestId("search-focus-key")).toHaveTextContent("1");
  });

  it("バーを閉じた時に隠れた検索語をクリアする", () => {
    render(<TopBarHarness />);

    act(() => {
      window.dispatchEvent(new window.CustomEvent("thread-search-toggle"));
    });
    fireEvent.click(screen.getByRole("button", { name: "set query" }));

    expect(screen.getByTestId("search-query")).toHaveTextContent("abc");

    fireEvent.click(screen.getByRole("button", { name: "close" }));

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("none");
    expect(screen.getByTestId("search-query")).toBeEmptyDOMElement();
  });
});
