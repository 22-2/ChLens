import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  SimpleDataTable,
  type ColumnDef,
} from "src/view/browser/components/SimpleDataTable";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

interface TestRow {
  id: string;
  title: string;
  boardTitle: string;
  resCount: number;
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

describe("SimpleDataTable", () => {
  const storageKey = "test_simple_data_table_columns_visibility";
  const rows: TestRow[] = [
    {
      id: "row-1",
      title: "スレ1",
      boardTitle: "板A",
      resCount: 12,
    },
  ];
  const columns: ColumnDef<TestRow>[] = [
    {
      key: "title",
      header: "タイトル",
      cellClassName: "title-cell",
      sortable: true,
      cell: (row) => row.title,
    },
    {
      key: "boardTitle",
      header: "板",
      cellClassName: "board-cell",
      sortable: true,
      cell: (row) => row.boardTitle,
    },
    {
      key: "resCount",
      header: "レス",
      cellClassName: "count-cell",
      sortable: true,
      cell: (row) => row.resCount,
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

  it("ヘッダの右クリックで列を非表示にでき、タイトル列は固定される", () => {
    render(
      <SimpleDataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        columnVisibilityStorageKey={storageKey}
        columnVisibilityLockedKeys={["title"]}
      />,
    );

    const boardHeader = screen.getByRole("columnheader", { name: "板" });
    fireEvent.contextMenu(boardHeader);

    fireEvent.click(screen.getByRole("button", { name: "板を非表示にする" }));

    expect(screen.queryByRole("columnheader", { name: "板" })).toBeNull();
    expect(
      screen.getByRole("columnheader", { name: "タイトル" }),
    ).toBeInTheDocument();
    expect(screen.getByText("スレ1")).toBeInTheDocument();
    expect(screen.queryByText("板A")).toBeNull();

    fireEvent.contextMenu(
      screen.getByRole("columnheader", { name: "タイトル" }),
    );
    expect(
      screen.getByRole("button", { name: "タイトルは非表示にできません" }),
    ).toBeDisabled();
  });
});
