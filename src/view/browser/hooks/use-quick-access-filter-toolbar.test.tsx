import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import { QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE } from "src/view/browser/utils/filter-toolbar-events";
import { afterEach, describe, expect, it } from "vite-plus/test";

function QuickAccessFilterHarness({
  isActive = true,
  virtualized = false,
  isWheelToggleEnabled = true,
}: {
  isActive?: boolean;
  virtualized?: boolean;
  isWheelToggleEnabled?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    pageType: "threadList",
    tabId: "tab-1",
    isActive,
    isWheelToggleEnabled,
    searchQuery,
    setSearchQuery,
  });

  const table = (
    <table className="simple-data-table">
      <tbody>
        <tr>
          <td>row</td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <div className="content-area__tab-panel" data-tab-panel-id="tab-1" data-testid="panel">
      <output data-testid="filter-state">{isFilterOpen ? "open" : "closed"}</output>
      <input
        aria-label="search query"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      <button type="button" onClick={closeFilterToolbar}>
        close
      </button>
      {virtualized ? (
        <div className="simple-data-table__scroller" data-testid="table-scroller">
          {table}
        </div>
      ) : (
        table
      )}
    </div>
  );
}

describe("クイックアクセスのフィルタ開閉", () => {
  afterEach(() => {
    cleanup();
  });

  it("通常テーブルの上端で上方向へホイールするとフィルタを開く", () => {
    render(<QuickAccessFilterHarness />);

    fireEvent.wheel(screen.getByTestId("panel"), { deltaY: -48 });

    expect(screen.getByTestId("filter-state")).toHaveTextContent("open");
  });

  it.each([false, true])(
    "ホイール開閉を無効にした一覧ではフィルタを開かない（仮想化: %s）",
    (virtualized) => {
      render(<QuickAccessFilterHarness isWheelToggleEnabled={false} virtualized={virtualized} />);

      fireEvent.wheel(screen.getByText("row"), { deltaY: -48 });

      expect(screen.getByTestId("filter-state")).toHaveTextContent("closed");
    },
  );

  it("ホイール開閉が無効でも既存のトグル操作で開閉でき、ホイールで入力を隠さない", () => {
    render(<QuickAccessFilterHarness isWheelToggleEnabled={false} />);
    const toggleFilter = () =>
      fireEvent(
        window,
        new CustomEvent(QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.threadList, {
          detail: { tabId: "tab-1" },
        }),
      );

    toggleFilter();
    expect(screen.getByTestId("filter-state")).toHaveTextContent("open");
    fireEvent.change(screen.getByLabelText("search query"), { target: { value: "検索語" } });
    fireEvent.wheel(screen.getByText("row"), { deltaY: 48 });
    expect(screen.getByTestId("filter-state")).toHaveTextContent("open");
    expect(screen.getByLabelText("search query")).toHaveValue("検索語");

    toggleFilter();
    expect(screen.getByTestId("filter-state")).toHaveTextContent("closed");
    expect(screen.getByLabelText("search query")).toHaveValue("");
  });

  it("仮想テーブルは内側のスクロール位置で上端を判定する", () => {
    render(<QuickAccessFilterHarness virtualized />);

    const scroller = screen.getByTestId("table-scroller");
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => 24,
    });
    fireEvent.wheel(screen.getByText("row"), { deltaY: -48 });
    expect(screen.getByTestId("filter-state")).toHaveTextContent("closed");

    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => 0,
    });
    fireEvent.wheel(screen.getByText("row"), { deltaY: -48 });
    expect(screen.getByTestId("filter-state")).toHaveTextContent("open");
  });

  it("非アクティブなテーブルではフィルタを開かない", () => {
    render(<QuickAccessFilterHarness isActive={false} />);

    fireEvent.wheel(screen.getByText("row"), { deltaY: -48 });

    expect(screen.getByTestId("filter-state")).toHaveTextContent("closed");
  });

  it("ホイールで開いた直後の下方向ホイールはスクロールせずフィルタだけ閉じる", () => {
    render(<QuickAccessFilterHarness />);

    const panel = screen.getByTestId("panel");
    fireEvent.wheel(panel, { deltaY: -48 });

    const closeWheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 48,
    });
    fireEvent(panel, closeWheelEvent);

    expect(closeWheelEvent.defaultPrevented).toBe(true);
    expect(screen.getByTestId("filter-state")).toHaveTextContent("closed");

    const nextWheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 48,
    });
    fireEvent(panel, nextWheelEvent);
    expect(nextWheelEvent.defaultPrevented).toBe(false);
  });

  it("ホイールで閉じても適用中の絞り込みは維持する", () => {
    render(<QuickAccessFilterHarness />);

    const panel = screen.getByTestId("panel");
    fireEvent.wheel(panel, { deltaY: -48 });
    fireEvent.change(screen.getByLabelText("search query"), { target: { value: "検索語" } });
    fireEvent.wheel(panel, { deltaY: 48 });

    expect(screen.getByTestId("filter-state")).toHaveTextContent("closed");
    expect(screen.getByLabelText("search query")).toHaveValue("検索語");
  });

  it("閉じるボタンでは従来どおり絞り込みを解除する", () => {
    render(<QuickAccessFilterHarness />);

    fireEvent.wheel(screen.getByTestId("panel"), { deltaY: -48 });
    fireEvent.change(screen.getByLabelText("search query"), { target: { value: "検索語" } });
    fireEvent.click(screen.getByRole("button", { name: "close" }));

    expect(screen.getByTestId("filter-state")).toHaveTextContent("closed");
    expect(screen.getByLabelText("search query")).toHaveValue("");
  });
});
