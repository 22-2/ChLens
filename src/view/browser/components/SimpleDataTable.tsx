import React, { useRef } from "react";

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
  // 中クリック後に続けて発火する click イベントで誤遷移しないよう抑止する
  const suppressNextRowClickRef = useRef(false);

  const sortIndicator = (key: string): string => {
    if (sortColumn !== key) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  return (
    <table className="simple-data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={
                col.headerClassName
                  ? `simple-data-table__th ${col.headerClassName}`
                  : "simple-data-table__th"
              }
              onClick={
                col.sortable && onSort ? () => onSort(col.key) : undefined
              }
            >
              {col.header}
              {col.sortable ? sortIndicator(col.key) : ""}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const extraClass = getRowClassName?.(row);
          return (
            <tr
              key={getRowKey(row)}
              className={
                extraClass
                  ? `simple-data-table__row ${extraClass}`
                  : "simple-data-table__row"
              }
              style={getRowStyle?.(row)}
              onClick={() => {
                if (suppressNextRowClickRef.current) {
                  suppressNextRowClickRef.current = false;
                  return;
                }
                onRowClick?.(row);
              }}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  // 中クリック直後の click イベントを 1 回だけ無視する
                  suppressNextRowClickRef.current = true;
                  onRowMiddleClick?.(row);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onRowContextMenu?.(row, e.clientX, e.clientY);
              }}
            >
              {columns.map((col) => (
                <td key={col.key} className={col.cellClassName}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
