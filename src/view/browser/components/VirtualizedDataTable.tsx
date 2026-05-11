import { useVirtualizer } from "@tanstack/react-virtual";
import React, { useEffect, useMemo, useRef } from "react";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { type ColumnDef } from "src/view/browser/components/SimpleDataTable";
import { useColumnVisibility } from "src/view/browser/components/use-column-visibility";

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
  estimatedRowHeight?: number;
  overscan?: number;
  endReachedThreshold?: number;
  onEndReached?: () => void;
  columnVisibilityStorageKey?: string;
  columnVisibilityLockedKeys?: readonly string[];
}

export function VirtualizedDataTable<TRow>({
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
  estimatedRowHeight = 52,
  overscan = 8,
  endReachedThreshold = 10,
  onEndReached,
  columnVisibilityStorageKey,
  columnVisibilityLockedKeys,
}: Props<TRow>): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    if (!onEndReached || virtualRows.length === 0 || rows.length === 0) {
      return;
    }

    const lastVisibleRow = virtualRows[virtualRows.length - 1];
    if (lastVisibleRow.index >= rows.length - 1 - endReachedThreshold) {
      onEndReached();
    }
  }, [endReachedThreshold, onEndReached, rows.length, virtualRows]);

  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  const colDefMap = useMemo(
    () => new Map(visibleColumns.map((column) => [column.key, column])),
    [visibleColumns],
  );

  const sortIndicator = (key: string): string => {
    if (sortColumn !== key) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  return (
    <div ref={scrollRef} className="simple-data-table__scroller">
      <table className="simple-data-table">
        <thead>
          <tr>
            {visibleColumns.map((column) => {
              const className = column.headerClassName
                ? `simple-data-table__th ${column.headerClassName}`
                : "simple-data-table__th";

              return (
                <th
                  key={column.key}
                  className={className}
                  onClick={
                    column.sortable && onSort
                      ? () => onSort(column.key)
                      : undefined
                  }
                  onContextMenu={(event) => {
                    if (!columnVisibilityStorageKey) {
                      return;
                    }

                    event.preventDefault();
                    openHeaderContextMenu(event.clientX, event.clientY);
                  }}
                >
                  {column.header}
                  {column.sortable ? sortIndicator(column.key) : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 ? (
            <tr className="simple-data-table__spacer" aria-hidden="true">
              <td
                colSpan={Math.max(visibleColumns.length, 1)}
                style={{ height: `${paddingTop}px` }}
              />
            </tr>
          ) : null}

          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            const extraClass = getRowClassName?.(row);

            return (
              <tr
                key={getRowKey(row)}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                className={
                  extraClass
                    ? `simple-data-table__row ${extraClass}`
                    : "simple-data-table__row"
                }
                style={getRowStyle?.(row)}
                onClick={() => onRowClick?.(row)}
                onMouseDown={(event) => {
                  if (event.button === 1) {
                    event.preventDefault();
                    event.stopPropagation();
                    onRowMiddleClick?.(row);
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onRowContextMenu?.(row, event.clientX, event.clientY);
                }}
              >
                {visibleColumns.map((column) => {
                  const colDef = colDefMap.get(column.key);
                  return (
                    <td
                      key={column.key}
                      className={colDef?.cellClassName ?? ""}
                    >
                      {column.cell(row)}
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {paddingBottom > 0 ? (
            <tr className="simple-data-table__spacer" aria-hidden="true">
              <td
                colSpan={Math.max(visibleColumns.length, 1)}
                style={{ height: `${paddingBottom}px` }}
              />
            </tr>
          ) : null}
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
    </div>
  );
}
