import { Tooltip } from "@mantine/core";
import {
  type ColumnDef as TanstackColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import React, { useMemo } from "react";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { useColumnVisibility } from "src/view/browser/components/use-column-visibility";

// 変更理由: 汎用コンポーネント化のため `ThreadListTable` から名前を変更しました。
//           既存の動作は保持しつつ、スレッドに限定しない名称に統一します。
export interface ColumnDef<TRow> {
  key: string;
  header: React.ReactNode;
  visibilityLabel?: string;
  headerClassName?: string;
  cellClassName: string;
  cell: (row: TRow) => React.ReactNode;
  sortable?: boolean;
  hideable?: boolean;
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
  // 変更理由: タイトル列を1行省略表示にした分、全文は行全体のホバーで
  // 確認できるようにするため、行単位のツールチップ文言を受け取れるようにする。
  getRowTooltip?: (row: TRow) => string;
  columnVisibilityStorageKey?: string;
  columnVisibilityLockedKeys?: readonly string[];
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
  getRowTooltip,
  columnVisibilityStorageKey,
  columnVisibilityLockedKeys,
}: Props<TRow>): React.ReactElement {
  const {
    visibleColumns,
    columnVisibilityMenuItems,
    openHeaderContextMenu,
    closeHeaderContextMenu,
    headerContextMenuState,
  } = useColumnVisibility(columns, {
    storageKey: columnVisibilityStorageKey,
    lockedColumnKeys: columnVisibilityLockedKeys,
  });

  // 変更理由: カスタム ColumnDef を TanStack Table の ColumnDef へ変換する。
  //           header/cell は関数でラップし、flexRender が正しく呼び出せるようにする。
  const tanstackColumns = useMemo<TanstackColumnDef<TRow>[]>(
    () =>
      visibleColumns.map((col) => ({
        id: col.key,
        header: () => col.header,
        cell: (info) => col.cell(info.row.original),
        enableSorting: col.sortable ?? false,
      })),
    [visibleColumns],
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
  const colDefMap = useMemo(() => new Map(visibleColumns.map((c) => [c.key, c])), [visibleColumns]);

  const sortIndicator = (key: string): string => {
    if (sortColumn !== key) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  return (
    <>
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
                    onClick={colDef?.sortable && onSort ? () => onSort(header.id) : undefined}
                    onContextMenu={(event) => {
                      if (!columnVisibilityStorageKey) {
                        return;
                      }

                      event.preventDefault();
                      openHeaderContextMenu(event.clientX, event.clientY);
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
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
            const rowElement = (
              <tr
                className={
                  extraClass ? `simple-data-table__row ${extraClass}` : "simple-data-table__row"
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

            const tooltipLabel = getRowTooltip?.(original);
            if (!tooltipLabel) {
              return <React.Fragment key={row.id}>{rowElement}</React.Fragment>;
            }

            return (
              <Tooltip.Floating key={row.id} label={tooltipLabel}>
                {rowElement}
              </Tooltip.Floating>
            );
          })}
        </tbody>
      </table>
      {headerContextMenuState ? (
        <ContextMenu
          x={headerContextMenuState.x}
          y={headerContextMenuState.y}
          items={columnVisibilityMenuItems}
          onClose={closeHeaderContextMenu}
        />
      ) : null}
    </>
  );
}
