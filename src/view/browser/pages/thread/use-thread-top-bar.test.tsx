import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { toggleFilter as toggleFilterForTab } from "src/view/browser/extension/page-actions";
import { useThreadTopBar } from "src/view/browser/pages/thread/use-thread-top-bar";
import type { ThreadFilter } from "src/view/browser/types";
import { afterEach, describe, expect, it } from "vite-plus/test";

function TopBarHarness({
  isActive = true,
  tabId = "tab-1",
  pinnedOpen = false,
}: {
  isActive?: boolean;
  tabId?: string;
  pinnedOpen?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const {
    activeTopBar,
    closeTopBar,
    closeTopBarPreservingFilter,
    openFilterToolbar,
    searchFocusKey,
    suppressInitialFocus,
  } = useThreadTopBar({
    tabId,
    isActive,
    searchQuery,
    setSearchQuery,
    clearFilter: () => setFilter("all"),
    pinnedOpen,
  });

  return (
    <div>
      <output data-testid="active-top-bar">{activeTopBar}</output>
      <output data-testid="search-focus-key">{searchFocusKey}</output>
      <output data-testid="suppress-initial-focus">{String(suppressInitialFocus)}</output>
      <output data-testid="search-query">{searchQuery}</output>
      <output data-testid="filter">{filter}</output>
      <button onClick={() => setSearchQuery("abc")}>set query</button>
      <button onClick={() => setFilter("image")}>set filter</button>
      <button onClick={closeTopBar}>close</button>
      <button onClick={closeTopBarPreservingFilter}>wheel close</button>
      <button onClick={openFilterToolbar}>open filter</button>
    </div>
  );
}

describe("useThreadTopBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("常時表示の設定のときは開いた状態で始まり、入力欄へのフォーカスを抑える", () => {
    render(<TopBarHarness pinnedOpen />);

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("filter");
    expect(screen.getByTestId("suppress-initial-focus")).toHaveTextContent("true");
  });

  it("常時表示の設定のときは閉じる操作を無視し、検索語とフィルタを保つ", () => {
    render(<TopBarHarness pinnedOpen />);

    fireEvent.click(screen.getByRole("button", { name: "set query" }));
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    fireEvent.click(screen.getByRole("button", { name: "wheel close" }));

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("filter");
    expect(screen.getByTestId("search-query")).toHaveTextContent("abc");
  });

  it("常時表示の設定のときはタイトルバー相当の開閉操作で閉じない", () => {
    render(<TopBarHarness pinnedOpen />);

    act(() => {
      toggleFilterForTab(window, "tab-1");
    });

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("filter");
  });

  it("設定が無いときは閉じた状態で始まる", () => {
    render(<TopBarHarness />);

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("none");
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
    fireEvent.click(screen.getByRole("button", { name: "set filter" }));

    expect(screen.getByTestId("search-query")).toHaveTextContent("abc");

    fireEvent.click(screen.getByRole("button", { name: "close" }));

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("none");
    expect(screen.getByTestId("search-query")).toBeEmptyDOMElement();
    expect(screen.getByTestId("filter")).toHaveTextContent("all");
  });

  it("明示openでは閉じ戻らずフィルタバーを開く", () => {
    render(<TopBarHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open filter" }));
    fireEvent.click(screen.getByRole("button", { name: "open filter" }));

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("filter");
  });

  it("対象タブへのフィルタバー開閉操作でフィルタバーを開閉する", () => {
    render(<TopBarHarness />);

    fireEvent.click(screen.getByRole("button", { name: "set filter" }));

    act(() => {
      toggleFilterForTab(window, "tab-1");
    });

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("filter");

    act(() => {
      toggleFilterForTab(window, "tab-1");
    });

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("none");
    expect(screen.getByTestId("filter")).toHaveTextContent("all");
  });

  it("別タブや非アクティブなスレッドには開閉操作を届けない", () => {
    render(
      <>
        <TopBarHarness />
        <TopBarHarness isActive={false} tabId="tab-2" />
      </>,
    );

    act(() => {
      toggleFilterForTab(window, "tab-2");
    });

    expect(screen.getAllByTestId("active-top-bar")[0]).toHaveTextContent("none");
    expect(screen.getAllByTestId("active-top-bar")[1]).toHaveTextContent("none");
  });

  it("非表示と画面終了後はフィルター操作を受け取らない", () => {
    const { rerender, unmount } = render(<TopBarHarness />);
    expect(toggleFilterForTab(window, "tab-1")).toBe("executed");
    rerender(<TopBarHarness isActive={false} />);
    expect(toggleFilterForTab(window, "tab-1")).toBe("target-unavailable");
    rerender(<TopBarHarness />);
    expect(toggleFilterForTab(window, "tab-1")).toBe("executed");
    unmount();
    expect(toggleFilterForTab(window, "tab-1")).toBe("target-unavailable");
  });

  it("ホイール相当のクローズでは検索語による絞り込みを維持する", () => {
    render(<TopBarHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open filter" }));
    fireEvent.click(screen.getByRole("button", { name: "set query" }));
    fireEvent.click(screen.getByRole("button", { name: "wheel close" }));

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("none");
    expect(screen.getByTestId("search-query")).toHaveTextContent("abc");
  });
});
