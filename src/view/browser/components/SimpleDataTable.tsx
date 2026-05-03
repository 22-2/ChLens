import {
  type ColumnDef as TanstackColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import React, { useMemo } from "react";

// 変更理由: 汎用コンポーネント化のため `ThreadListTable` から名前を変更しました。
//           既存の動作は保持しつつ、スレッドに限定しない名称に統一します。
export interface ColumnDef<TRow> {
  key: string;
  header: React.ReactNode;
  headerClassName?: string;
  cellClassName: string;
  cell: (row: TRow) => React.ReactNode;
  sortable?: boolean;
}

interface Props<TRow> {
  columns: ColumnDef<TRow>[];
  rows: TRow[];
  getRowKey: (row: TRow) => string;
  getRowClassName?: (row: TRow) => string | undefined;
  getRowStyle?: (row: TRow) => React.CSSProperties;
  onRowClick?: (row: TRow) => void;
  onRowMiddleClick?: (row: TRow) => void;
  onRowContextMenu?: (row: TRow, x: number, y: number) => void;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string) => void;
}

export function SimpleDataTable<TRow>({
  columns,
  rows,
  getRowKey,
  getRowClassName,
  getRowStyle,
  onRowClick,
  onRowMiddleClick,
  onRowContextMenu,
  sortColumn,
  sortDirection,
  onSort,
}: Props<TRow>): React.ReactElement {
  // 変更理由: カスタム ColumnDef を TanStack Table の ColumnDef へ変換する。
  //           header/cell は関数でラップし、flexRender が正しく呼び出せるようにする。
  const tanstackColumns = useMemo<TanstackColumnDef<TRow>[]>(
    () =>
      columns.map((col) => ({
        id: col.key,
        header: () => col.header,
        cell: (info) => col.cell(info.row.original),
        enableSorting: col.sortable ?? false,
      })),
    // columns は親からの安定した参照を期待する（ThreadListPage では module-level 定数）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns],
  );

  // ソートは呼び出し元 (ThreadListPage) が管理するため manualSorting: true にする。
  // TanStack Table はロウモデル管理とセル描画ループの一元化のために使用する。
  const table = useReactTable({
    data: rows,
    columns: tanstackColumns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    getRowId: getRowKey,
  });

  // key → ColumnDef のルックアップを O(1) にする
  const colDefMap = useMemo(
    () => new Map(columns.map((c) => [c.key, c])),
    [columns],
  );

  const sortIndicator = (key: string): string => {
    if (sortColumn !== key) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  return (
    <table className="simple-data-table">
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const colDef = colDefMap.get(header.id);
              const cn = colDef?.headerClassName
                ? `simple-data-table__th ${colDef.headerClassName}`
                : "simple-data-table__th";
              return (
                <th
                  key={header.id}
                  className={cn}
                  onClick={
                    colDef?.sortable && onSort
                      ? () => onSort(header.id)
                      : undefined
                  }
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {colDef?.sortable ? sortIndicator(header.id) : ""}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => {
          const original = row.original;
          const extraClass = getRowClassName?.(original);
          return (
            <tr
              key={row.id}
              className={
                extraClass
                  ? `simple-data-table__row ${extraClass}`
                  : "simple-data-table__row"
              }
              style={getRowStyle?.(original)}
              onClick={() => onRowClick?.(original)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  // 中クリックは別ハンドラとして処理し、次回の左クリックは抑止しない。
                  // ここで抑止フラグを持つと「中クリック後の最初の左クリック無効化」が再発するため。
                  onRowMiddleClick?.(original);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onRowContextMenu?.(original, e.clientX, e.clientY);
              }}
            >
              {row.getVisibleCells().map((cell) => {
                const colDef = colDefMap.get(cell.column.id);
                return (
                  <td key={cell.id} className={colDef?.cellClassName ?? ""}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
