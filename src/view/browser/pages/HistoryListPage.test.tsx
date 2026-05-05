import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { container } from "src/service-container";
import { HistoryListPage } from "src/view/browser/pages/HistoryListPage";
import { QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE } from "src/view/browser/utils/filter-toolbar-events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseTabStore = vi.fn();
const virtualizedTableState = vi.hoisted(() => ({
  onEndReached: undefined as (() => void) | undefined,
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => mockUseTabStore(),
  // useTabDispatch は dispatch のみを返す安定した関数。ページのフル状態購読回避後もdispatchが使える。
  useTabDispatch: () => vi.fn(),
}));

vi.mock("src/view/browser/components/VirtualizedDataTable", () => ({
  VirtualizedDataTable: ({
    columns,
    rows,
    getRowKey,
    onEndReached,
  }: {
    columns: Array<{
      key: string;
      header: React.ReactNode;
      cell: (row: unknown) => React.ReactNode;
    }>;
    rows: unknown[];
    getRowKey: (row: unknown) => string;
    onEndReached?: () => void;
  }) => {
    virtualizedTableState.onEndReached = onEndReached;

    return (
      <div data-testid="virtualized-table">
        <div>
          {columns.map((column) => (
            <span key={column.key}>{column.header}</span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={getRowKey(row)}>
            {columns.map((column) => (
              <span key={column.key}>{column.cell(row)}</span>
            ))}
          </div>
        ))}
      </div>
    );
  },
}));

interface HistoryService {
  get: (offset?: number, count?: number) => Promise<unknown[]>;
}

interface ReadStateService {
  getAll: () => Promise<unknown[]>;
}

interface AppLikeWindow extends Window {
  app?: {
    History?: HistoryService;
    ReadState?: ReadStateService;
  };
}

function createHistoryItem(
  url: string,
  title: string,
  boardTitle: string,
  date: number,
) {
  return {
    url,
    title,
    boardTitle,
    date,
  };
}

function createReadStateItem(url: string, read: number, received: number) {
  return {
    url,
    read,
    received,
  };
}

describe("HistoryListPage", () => {
  const historyGet = vi.fn<HistoryService["get"]>();
  const readStateGetAll = vi.fn<ReadStateService["getAll"]>();

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockUseTabStore.mockReset();
    historyGet.mockReset();
    readStateGetAll.mockReset();
    virtualizedTableState.onEndReached = undefined;

    mockUseTabStore.mockReturnValue({
      dispatch: vi.fn(),
      state: {
        tabs: [],
        activeTabId: "tab-1",
        closedTabs: [],
      },
      currentPage: {
        type: "historyList",
        title: "閲覧履歴",
      },
    });

    (window as AppLikeWindow).app = {
      History: {
        get: historyGet,
      },
      ReadState: {
        getAll: readStateGetAll,
      },
    };

    container.message = {
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    readStateGetAll.mockResolvedValue([]);
  });

  it("旧履歴の date を閲覧日時として表示する", async () => {
    historyGet.mockResolvedValueOnce([
      createHistoryItem(
        "https://hayabusa.5ch.io/test/read.cgi/live/1/",
        "スレ1",
        "なんでも実況J",
        new Date(2026, 4, 3, 1, 2).getTime(),
      ),
    ]);
    readStateGetAll.mockResolvedValueOnce([
      createReadStateItem("https://*.5ch.io/test/read.cgi/live/1/", 4, 9),
    ]);

    render(<HistoryListPage tabId="tab-1" isActive={true} />);

    await screen.findByTestId("virtualized-table");

    expect(screen.getByText("2026/05/03 01:02")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(historyGet).toHaveBeenCalledWith(undefined, 500);
    expect(readStateGetAll).toHaveBeenCalledTimes(1);
  });

  it("スクロール終端で次ページを読み込み、URL重複を除外する", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) =>
      createHistoryItem(
        "https://example.com/test/read.cgi/live/1/",
        index === 0 ? "スレ1" : `スレ1重複-${index}`,
        "板A",
        new Date(2026, 4, 3, 1, 2).getTime(),
      ),
    );

    historyGet
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([
        createHistoryItem(
          "https://example.com/test/read.cgi/live/1/",
          "スレ1(重複)",
          "板A",
          new Date(2026, 4, 3, 1, 3).getTime(),
        ),
        createHistoryItem(
          "https://example.com/test/read.cgi/live/2/",
          "スレ2",
          "板B",
          new Date(2026, 4, 3, 1, 4).getTime(),
        ),
      ]);

    render(<HistoryListPage tabId="tab-1" isActive={true} />);

    await screen.findByText("スレ1");

    await act(async () => {
      virtualizedTableState.onEndReached?.();
    });

    await waitFor(() => {
      expect(historyGet).toHaveBeenNthCalledWith(2, 500, 500);
    });

    expect(screen.getByText("スレ2")).toBeInTheDocument();
    expect(screen.getAllByText(/スレ1/)).toHaveLength(1);
  });

  it("履歴フィルターバーをメニューイベントで開閉できる", async () => {
    historyGet.mockResolvedValueOnce([
      createHistoryItem(
        "https://example.com/test/read.cgi/live/1/",
        "スレ1",
        "なんでも実況J",
        new Date(2026, 4, 3, 1, 2).getTime(),
      ),
    ]);

    render(<HistoryListPage tabId="tab-1" isActive={true} />);

    await screen.findByTestId("virtualized-table");
    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(
          QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.historyList,
          {
            detail: { tabId: "tab-1" },
          },
        ),
      );
    });

    const input = screen.getByPlaceholderText("検索...");
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "スレ1" } });
    fireEvent.click(screen.getByRole("button", { name: "✕" }));

    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(
          QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.historyList,
          {
            detail: { tabId: "tab-1" },
          },
        ),
      );
    });

    expect(screen.getByPlaceholderText("検索...")).toHaveValue("");
  });
});
