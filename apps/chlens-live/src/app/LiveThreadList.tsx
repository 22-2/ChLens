import type { ReactElement } from "react";
import { SearchBar } from "../../../../src/view/browser/components/SearchBar";
import {
  SimpleDataTable,
  type ColumnDef,
} from "../../../../src/view/browser/components/SimpleDataTable";
import { Spinner } from "../../../../src/view/browser/ui/Spinner";
import {
  ThreadListView,
  type ThreadListViewRow,
  type ThreadListViewSortColumn,
  type ThreadListViewSortDirection,
} from "../../../../src/view/shared/ThreadListView";

const COLUMNS: ColumnDef<ThreadListViewRow>[] = [
  {
    key: "num",
    header: "No.",
    headerClassName: "thread-list__th--num",
    cellClassName: "thread-list__num",
    sortable: true,
    cell: (row) => row.num ?? "",
  },
  {
    key: "title",
    header: "タイトル",
    headerClassName: "thread-list__th--title",
    cellClassName: "thread-list__title",
    sortable: true,
    cell: (row) => (
      <>
        {row.title}
        {row.label ? <span className="thread-list-view__label">{row.label}</span> : null}
      </>
    ),
  },
  {
    key: "resCount",
    header: "レス",
    headerClassName: "thread-list__th--count",
    cellClassName: "thread-list__count",
    sortable: true,
    cell: (row) => row.resCount,
  },
  {
    key: "unreadCount",
    header: "未読",
    headerClassName: "thread-list__th--count",
    cellClassName: "thread-list__count",
    sortable: true,
    cell: (row) => row.unreadCount || "",
  },
  {
    key: "heat",
    header: "勢い",
    headerClassName: "thread-list__th--heat",
    cellClassName: "thread-list__heat",
    sortable: true,
    cell: (row) => row.heat?.toFixed(1) ?? "",
  },
];

interface LiveThreadListProps {
  rows: ThreadListViewRow[];
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  filterOpen: boolean;
  onFilterClose: () => void;
  sortColumn: ThreadListViewSortColumn | null;
  sortDirection: ThreadListViewSortDirection;
  onSort: (column: ThreadListViewSortColumn) => void;
  onSelect?: (row: ThreadListViewRow) => void;
  onMiddleClick?: (row: ThreadListViewRow) => void;
}

/** ChLens本体と同じ検索バー・状態表示・テーブルをLiveのデータへ接続する。 */
export function LiveThreadList(props: LiveThreadListProps): ReactElement {
  if (props.loading && props.rows.length === 0) {
    // 変更理由: 初回取得中に未操作の検索欄を残さず、ChLensと同じ状態表示へ揃える。
    return (
      <div className="page-status">
        <Spinner size="sm" aria-label="スレ一覧を読み込み中" />
        <span>読み込み中...</span>
      </div>
    );
  }
  if (props.error && props.rows.length === 0)
    return (
      <div className="page-status page-status--error" role="alert">
        {props.error}
      </div>
    );
  return (
    <ThreadListView
      rows={[]}
      loading={false}
      error={null}
      query={props.query}
      onQueryChange={props.onQueryChange}
      searchMode="custom"
      searchContent={
        props.filterOpen ? (
          <SearchBar
            query={props.query}
            onQueryChange={props.onQueryChange}
            onClose={props.onFilterClose}
            hitCount={props.rows.length}
            placeholder="タイトルで絞り込み"
          />
        ) : null
      }
    >
      <SimpleDataTable
        columns={COLUMNS}
        rows={props.rows}
        getRowKey={(row) => row.id}
        getRowTooltip={(row) => row.title}
        onRowClick={props.onSelect}
        onRowMiddleClick={props.onMiddleClick}
        sortColumn={props.sortColumn ?? undefined}
        sortDirection={props.sortDirection}
        onSort={(key) => props.onSort(key as ThreadListViewSortColumn)}
      />
    </ThreadListView>
  );
}
