import { flexRender } from "@tanstack/react-table";
import {
  getCoreRowModel,
  type LegacyColumnDef as TanstackColumnDef,
  useLegacyTable,
} from "@tanstack/react-table/legacy";
import { ChevronDown, ChevronUp } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCursorTooltip } from "src/view/browser/components/CursorTooltip";
import { useColumnOrder } from "src/view/browser/components/use-column-order";
import { useColumnVisibility } from "src/view/browser/components/use-column-visibility";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";

// 変更理由: 汎用コンポーネント化のため `ThreadListTable` から名前を変更しました。
//           既存の動作は保持しつつ、スレッドに限定しない名称に統一します。
export interface ColumnDef<TRow> {
  key: string;
  header: React.ReactNode;
  visibilityLabel?: string;
  headerClassName?: string;
  cellClassName: string;
  cell: (row: TRow) => React.ReactNode;
  cellTooltip?: (row: TRow) => string;
  sortable?: boolean;
  hideable?: boolean;
}

export interface DataTableSection<TRow> {
  key: string;
  label?: React.ReactNode;
  rows: TRow[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  dividerStyle?: React.CSSProperties;
}

interface Props<TRow> {
  columns: ColumnDef<TRow>[];
  rows: TRow[];
  sections?: DataTableSection<TRow>[];
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
  columnOrderStorageKey?: string;
}

// 変更理由: TanStack Table v9 の RowData 制約（オブジェクトか配列）を満たすため TRow を object に制限する。
export function SimpleDataTable<TRow extends object>({
  columns,
  rows,
  sections,
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
  columnOrderStorageKey,
}: Props<TRow>): React.ReactElement {
  const { show, move, hide, tooltip } = useCursorTooltip();
  const { columnOrder, moveColumnBy, resetColumnOrder } = useColumnOrder(
    columns,
    columnOrderStorageKey,
  );
  const orderedColumns = useMemo(() => {
    const orderIndex = new Map(columnOrder.map((key, index) => [key, index]));
    return [...columns].sort(
      (left, right) =>
        (orderIndex.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
        (orderIndex.get(right.key) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [columnOrder, columns]);
  const {
    visibleColumns,
    columnVisibilityMenuItems,
    openHeaderContextMenu,
    closeHeaderContextMenu,
    headerContextMenuState,
  } = useColumnVisibility(orderedColumns, {
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
  // 変更理由: TanStack Table v9 では useReactTable が useTable に置き換わり API が大きく変わった。
  //           行モデルとセル描画しか使っていないため、v8 互換の useLegacyTable で移行コストを抑える。
  const table = useLegacyTable<TRow>({
    data: rows,
    columns: tanstackColumns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    getRowId: getRowKey,
  });

  // key → ColumnDef のルックアップを O(1) にする
  const colDefMap = useMemo(() => new Map(visibleColumns.map((c) => [c.key, c])), [visibleColumns]);
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(
    () => new Set(sections?.filter((section) => !section.defaultCollapsed).map(({ key }) => key)),
  );
  const [contextMenuColumnKey, setContextMenuColumnKey] = useState<string | null>(null);
  const [dropTargetColumnKey, setDropTargetColumnKey] = useState<string | null>(null);
  const draggedColumnKeyRef = useRef<string | null>(null);
  const suppressHeaderClickRef = useRef(false);

  const headerContextMenuItems = useMemo(() => {
    if (!columnOrderStorageKey || contextMenuColumnKey == null) {
      return columnVisibilityMenuItems;
    }

    const columnIndex = columnOrder.indexOf(contextMenuColumnKey);
    const isDefaultOrder = columnOrder.every((key, index) => key === columns[index]?.key);
    return [
      {
        id: "column-move-left",
        label: "列を左へ移動",
        disabled: columnIndex <= 0,
        onSelect: () => moveColumnBy(contextMenuColumnKey, -1),
      },
      {
        id: "column-move-right",
        label: "列を右へ移動",
        disabled: columnIndex < 0 || columnIndex >= columnOrder.length - 1,
        onSelect: () => moveColumnBy(contextMenuColumnKey, 1),
      },
      {
        id: "column-order-reset",
        label: "列順を初期化",
        disabled: isDefaultOrder,
        onSelect: resetColumnOrder,
      },
      { id: "column-order-separator", separator: true },
      ...columnVisibilityMenuItems,
    ];
  }, [
    columnOrder,
    columnOrderStorageKey,
    columnVisibilityMenuItems,
    columns,
    contextMenuColumnKey,
    moveColumnBy,
    resetColumnOrder,
  ]);

  const sortIndicator = (key: string): string => {
    if (sortColumn !== key) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  const toggleSection = (key: string): void => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    // 変更理由: 一覧更新でホバー中の行が差し替わるとmouseleaveが発火しないことがあるため、
    // 表示データが変わった時点で古い行のツールチップを確実に閉じる。
    hide();
  }, [hide, rows]);

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
                    className={
                      columnOrderStorageKey ? `${cn} simple-data-table__th--reorderable` : cn
                    }
                    draggable={Boolean(columnOrderStorageKey)}
                    data-drop-target={dropTargetColumnKey === header.id ? "true" : undefined}
                    title={
                      columnOrderStorageKey
                        ? `${typeof colDef?.header === "string" ? colDef.header : header.id}（ドラッグして列を並べ替え）`
                        : undefined
                    }
                    tabIndex={columnOrderStorageKey ? 0 : undefined}
                    onClick={() => {
                      if (suppressHeaderClickRef.current) {
                        suppressHeaderClickRef.current = false;
                        return;
                      }
                      if (colDef?.sortable && onSort) onSort(header.id);
                    }}
                    onContextMenu={(event) => {
                      if (!columnVisibilityStorageKey && !columnOrderStorageKey) {
                        return;
                      }

                      event.preventDefault();
                      setContextMenuColumnKey(header.id);
                      openHeaderContextMenu(event.clientX, event.clientY);
                    }}
                    onKeyDown={(event) => {
                      if (
                        !columnOrderStorageKey ||
                        !(event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
                      ) {
                        return;
                      }

                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setContextMenuColumnKey(header.id);
                      openHeaderContextMenu(rect.left, rect.bottom);
                    }}
                    onDragStart={(event) => {
                      if (!columnOrderStorageKey) return;
                      draggedColumnKeyRef.current = header.id;
                      suppressHeaderClickRef.current = true;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", header.id);
                    }}
                    onDragEnter={() => {
                      if (draggedColumnKeyRef.current !== header.id) {
                        setDropTargetColumnKey(header.id);
                      }
                    }}
                    onDragOver={(event) => {
                      if (!columnOrderStorageKey || draggedColumnKeyRef.current == null) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDragLeave={() => {
                      setDropTargetColumnKey((current) => (current === header.id ? null : current));
                    }}
                    onDrop={(event) => {
                      if (!columnOrderStorageKey) return;
                      event.preventDefault();
                      const sourceKey =
                        event.dataTransfer.getData("text/plain") || draggedColumnKeyRef.current;
                      if (!sourceKey || sourceKey === header.id) return;

                      const sourceIndex = columnOrder.indexOf(sourceKey);
                      const targetIndex = columnOrder.indexOf(header.id);
                      const isDroppingAfter =
                        event.clientX >
                        event.currentTarget.getBoundingClientRect().left +
                          event.currentTarget.getBoundingClientRect().width / 2;
                      const targetIndexAfterRemoval =
                        targetIndex - (sourceIndex < targetIndex ? 1 : 0);
                      const destinationIndex = Math.max(
                        0,
                        Math.min(
                          columnOrder.length - 1,
                          targetIndexAfterRemoval + (isDroppingAfter ? 1 : 0),
                        ),
                      );
                      moveColumnBy(sourceKey, destinationIndex - sourceIndex);
                      setDropTargetColumnKey(null);
                    }}
                    onDragEnd={() => {
                      draggedColumnKeyRef.current = null;
                      setDropTargetColumnKey(null);
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
          {(sections ?? [{ key: "default", rows }]).flatMap((section) => {
            const isExpanded = !section.collapsible || expandedSections.has(section.key);
            const sectionRowKeys = new Set(section.rows.map(getRowKey));
            const sectionRows = isExpanded
              ? table.getRowModel().rows.filter((row) => sectionRowKeys.has(row.id))
              : [];
            const divider = section.label ? (
              <tr key={`divider-${section.key}`} className="simple-data-table__divider-row">
                <td colSpan={visibleColumns.length}>
                  {section.collapsible ? (
                    <button
                      type="button"
                      className="simple-data-table__divider simple-data-table__divider--collapsible"
                      style={section.dividerStyle}
                      aria-expanded={isExpanded}
                      onClick={() => toggleSection(section.key)}
                    >
                      <span>{section.label}</span>
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  ) : (
                    <div className="simple-data-table__divider" style={section.dividerStyle}>
                      {section.label}
                    </div>
                  )}
                </td>
              </tr>
            ) : null;

            return [
              divider,
              ...sectionRows.map((row) => {
                const original = row.original;
                const extraClass = getRowClassName?.(original);
                // 変更理由: 省略表示した行タイトルの全文を確認できるよう、ツールチップは常時表示する。
                const tooltipLabel = getRowTooltip?.(original);
                const rowElement = (
                  <tr
                    className={
                      extraClass ? `simple-data-table__row ${extraClass}` : "simple-data-table__row"
                    }
                    style={getRowStyle?.(original)}
                    onMouseEnter={tooltipLabel ? (event) => show(tooltipLabel, event) : undefined}
                    onMouseMove={tooltipLabel ? (event) => move(tooltipLabel, event) : undefined}
                    onMouseLeave={hide}
                    onClick={() => {
                      hide();
                      onRowClick?.(original);
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        e.stopPropagation();
                        hide();
                        // 中クリックは別ハンドラとして処理し、次回の左クリックは抑止しない。
                        // ここで抑止フラグを持つと「中クリック後の最初の左クリック無効化」が再発するため。
                        onRowMiddleClick?.(original);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      hide();
                      onRowContextMenu?.(original, e.clientX, e.clientY);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const colDef = colDefMap.get(cell.column.id);
                      return (
                        <td
                          key={cell.id}
                          className={colDef?.cellClassName ?? ""}
                          onMouseMove={
                            colDef?.cellTooltip
                              ? (event) => {
                                  // 列固有の情報がある場合は、行タイトルのツールチップを上書きする。
                                  event.stopPropagation();
                                  move(colDef.cellTooltip!(original), event);
                                }
                              : undefined
                          }
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );

                return <React.Fragment key={row.id}>{rowElement}</React.Fragment>;
              }),
            ].filter((element) => element != null);
          })}
        </tbody>
      </table>
      {tooltip}
      {headerContextMenuState ? (
        <ContextMenu
          x={headerContextMenuState.x}
          y={headerContextMenuState.y}
          items={headerContextMenuItems}
          onClose={() => {
            setContextMenuColumnKey(null);
            closeHeaderContextMenu();
          }}
        />
      ) : null}
    </>
  );
}
