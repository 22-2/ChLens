import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { VirtualizedDataTable } from "src/view/browser/components/VirtualizedDataTable";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [{ index: 0, start: 0, end: 52 }],
    getTotalSize: () => 52,
    measureElement: vi.fn(),
  }),
}));

interface TestRow {
  id: string;
  title: string;
  boardTitle: string;
  unreadCount: number;
}

function createMemoryStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(items.keys())[index] ?? null;
    },
    removeItem(key: string) {
      items.delete(key);
    },
    setItem(key: string, value: string) {
      items.set(key, value);
    },
  };
}

describe("VirtualizedDataTable", () => {
  const storageKey = "test_virtualized_data_table_columns_visibility";
  const rows: TestRow[] = [
    {
      id: "row-1",
      title: "スレ1",
      boardTitle: "板A",
      unreadCount: 2,
    },
  ];
  const columns = [
    {
      key: "title",
      header: "タイトル",
      cellClassName: "title-cell",
      sortable: true,
      cell: (row: TestRow) => row.title,
    },
    {
      key: "boardTitle",
      header: "板",
      cellClassName: "board-cell",
      sortable: true,
      cell: (row: TestRow) => row.boardTitle,
    },
    {
      key: "unreadCount",
      header: "未読",
      cellClassName: "count-cell",
      sortable: true,
      cell: (row: TestRow) => row.unreadCount,
    },
  ];

  beforeEach(() => {
    const localStorageMock = createMemoryStorage();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
    localStorage.removeItem(storageKey);
  });

  afterEach(() => {
    cleanup();
    localStorage.removeItem(storageKey);
  });

  it("仮想スクロール版でもヘッダの右クリックで列を切り替えられる", () => {
    render(
      <VirtualizedDataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        columnVisibilityStorageKey={storageKey}
        columnVisibilityLockedKeys={["title"]}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("columnheader", { name: "板" }));
    fireEvent.click(screen.getByRole("button", { name: "板を非表示にする" }));

    expect(screen.queryByRole("columnheader", { name: "板" })).toBeNull();
    expect(screen.getByText("スレ1")).toBeInTheDocument();
    expect(screen.queryByText("板A")).toBeNull();

    fireEvent.contextMenu(screen.getByRole("columnheader", { name: "タイトル" }));
    expect(
      screen.getByRole("button", { name: "タイトルは非表示にできません" }),
    ).toBeDisabled();
  });
});
