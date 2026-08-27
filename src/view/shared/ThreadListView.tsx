import React, { type ReactNode } from "react";

export interface ThreadListViewRow {
  id: string;
  num?: number;
  title: string;
  resCount: number;
  unreadCount?: number;
  heat?: number;
  label?: string;
  state?: "normal" | "highlight" | "demoted";
}

export type ThreadListViewSortColumn = "num" | "title" | "resCount" | "unreadCount" | "heat";
export type ThreadListViewSortDirection = "asc" | "desc";

export interface ThreadListViewProps {
  rows: readonly ThreadListViewRow[];
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  sortColumn?: ThreadListViewSortColumn | null;
  sortDirection?: ThreadListViewSortDirection;
  onSort?: (column: ThreadListViewSortColumn) => void;
  selectedId?: string | null;
  onSelect?: (row: ThreadListViewRow) => void;
  onMiddleClick?: (row: ThreadListViewRow) => void;
  onContextMenu?: (row: ThreadListViewRow, x: number, y: number) => void;
  searchMode?: "default" | "custom" | "hidden";
  searchContent?: ReactNode;
  content?: ReactNode;
  children?: ReactNode;
  onDoubleClick?: React.MouseEventHandler<HTMLElement>;
}

const COLUMNS: readonly {
  key: ThreadListViewSortColumn;
  label: string;
}[] = [
  { key: "num", label: "No." },
  { key: "title", label: "タイトル" },
  { key: "resCount", label: "レス" },
  { key: "unreadCount", label: "未読" },
  { key: "heat", label: "勢い" },
];

function sortIndicator(
  column: ThreadListViewSortColumn,
  sortColumn: ThreadListViewSortColumn | null | undefined,
  direction: ThreadListViewSortDirection,
): string {
  if (column !== sortColumn) return "";
  return direction === "asc" ? " ▲" : " ▼";
}

/**
 * ThreadListの表示責務を取得元・タブ・Tauri APIから分離する共通View。
 * contentを渡す既存Chlens経路と、標準テーブルを使うLive経路の両方を同じ外枠で描画できる。
 */
export function ThreadListView({
  rows,
  loading,
  error,
  query,
  onQueryChange,
  sortColumn = null,
  sortDirection = "asc",
  onSort,
  selectedId = null,
  onSelect,
  onMiddleClick,
  onContextMenu,
  searchMode = "default",
  searchContent,
  content,
  children,
  onDoubleClick,
}: ThreadListViewProps): React.ReactElement {
  const defaultContent = (
    <table className="thread-list-view__table">
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <th key={column.key} scope="col">
              {onSort ? (
                <button type="button" onClick={() => onSort(column.key)}>
                  {column.label}
                  {sortIndicator(column.key, sortColumn, sortDirection)}
                </button>
              ) : (
                column.label
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.id}
            className={row.state ? `thread-list-view__row--${row.state}` : undefined}
            data-selected={row.id === selectedId ? "true" : undefined}
            onContextMenu={(event) => {
              if (!onContextMenu) return;
              event.preventDefault();
              onContextMenu(row, event.clientX, event.clientY);
            }}
            onDoubleClick={() => onSelect?.(row)}
            onMouseDown={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                onMiddleClick?.(row);
              }
            }}
            onClick={() => onSelect?.(row)}
          >
            <td>{index + 1}</td>
            <td>
              {row.title}
              {row.label && <span className="thread-list-view__label">{row.label}</span>}
            </td>
            <td>{row.resCount}</td>
            <td>{row.unreadCount || ""}</td>
            <td>{row.heat == null ? "" : row.heat.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <section className="thread-list-view" aria-label="スレ一覧" onDoubleClick={onDoubleClick}>
      {searchMode === "default" && (
        <input
          className="thread-list-view__search"
          type="search"
          placeholder="タイトルで絞り込み"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="スレタイトル絞り込み"
        />
      )}
      {searchMode === "custom" && searchContent}
      {loading && rows.length === 0 ? (
        <div className="thread-list-view__status">読み込み中…</div>
      ) : error && rows.length === 0 ? (
        <div className="thread-list-view__status thread-list-view__status--error" role="alert">
          {error}
        </div>
      ) : content != null || children != null ? (
        <>{content ?? children}</>
      ) : rows.length === 0 ? (
        <div className="thread-list-view__status">該当するスレはありません</div>
      ) : (
        defaultContent
      )}
    </section>
  );
}
