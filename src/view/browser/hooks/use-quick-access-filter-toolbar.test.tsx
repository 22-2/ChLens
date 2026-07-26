import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";

function QuickAccessFilterHarness({
  isActive = true,
  virtualized = false,
}: {
  isActive?: boolean;
  virtualized?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const { isFilterOpen } = useQuickAccessFilterToolbar({
    pageType: "threadList",
    tabId: "tab-1",
    isActive,
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

describe("useQuickAccessFilterToolbar wheel handling", () => {
  afterEach(() => {
    cleanup();
  });

  it("通常テーブルの上端で上方向へホイールするとフィルタを開く", () => {
    render(<QuickAccessFilterHarness />);

    fireEvent.wheel(screen.getByTestId("panel"), { deltaY: -48 });

    expect(screen.getByTestId("filter-state")).toHaveTextContent("open");
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
});
