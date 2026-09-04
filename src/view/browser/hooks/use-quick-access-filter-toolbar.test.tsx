import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useWheelPagination } from "src/view/browser/hooks/useWheelPagination";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";

function QuickAccessFilterHarness({
  isActive = true,
  virtualized = false,
}: {
  isActive?: boolean;
  virtualized?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
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

function WheelConflictHarness({ onRefresh }: { onRefresh: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { isFilterOpen } = useQuickAccessFilterToolbar({
    pageType: "threadList",
    tabId: "tab-1",
    isActive: true,
    searchQuery,
    setSearchQuery,
  });
  const { count } = useWheelPagination({
    isEnabled: true,
    isLoading: false,
    containerRef: scrollContainerRef,
    edge: "top",
    onRefresh,
  });

  return (
    <div
      className="content-area__tab-panel"
      data-tab-panel-id="tab-1"
      data-testid="panel"
      ref={scrollContainerRef}
    >
      <output data-testid="filter-state">{isFilterOpen ? "open" : "closed"}</output>
      <output data-testid="pagination-count">{count}</output>
      <table className="simple-data-table">
        <tbody>
          <tr>
            <td>row</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function setScrollableMetrics(element: HTMLElement): void {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 100 },
    scrollTop: { configurable: true, value: 0 },
  });
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

  it("更新ジェスチャーが先に処理したwheelではフィルタを開かない", () => {
    const refresh = vi.fn();
    render(<WheelConflictHarness onRefresh={refresh} />);
    setScrollableMetrics(screen.getByTestId("panel"));

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -48,
    });
    fireEvent(screen.getByText("row"), wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(screen.getByTestId("pagination-count")).toHaveTextContent("1");
    expect(screen.getByTestId("filter-state")).toHaveTextContent("closed");
    expect(refresh).not.toHaveBeenCalled();
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
