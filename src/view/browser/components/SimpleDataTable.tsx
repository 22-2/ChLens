import {
  type ColumnDef as TanstackColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp } from "lucide-react";
import React, { useEffect, useMemo } from "react";
import { useCursorTooltip } from "src/view/browser/components/CursorTooltip";
import { useColumnVisibility } from "src/view/browser/components/use-column-visibility";
import { useTableTooltipEnabled } from "src/view/browser/hooks/use-table-tooltip-setting";
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
}

export function SimpleDataTable<TRow>({
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
}: Props<TRow>): React.ReactElement {
  const tableTooltipEnabled = useTableTooltipEnabled();
  const { show, move, hide, tooltip } = useCursorTooltip();
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
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(
    () => new Set(sections?.filter((section) => !section.defaultCollapsed).map(({ key }) => key)),
  );

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
                const tooltipLabel = tableTooltipEnabled ? getRowTooltip?.(original) : undefined;
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
                        <td key={cell.id} className={colDef?.cellClassName ?? ""}>
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
          items={columnVisibilityMenuItems}
          onClose={closeHeaderContextMenu}
        />
      ) : null}
    </>
  );
}
