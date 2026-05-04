import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { ColumnDef } from "src/view/browser/components/SimpleDataTable";
import { VirtualizedDataTable } from "src/view/browser/components/VirtualizedDataTable";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import {
  formatCompactDateTime,
  normalizeLegacyTimestamp,
} from "src/view/browser/utils/date-time";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";

const PAGE_SIZE = 500;
const LOAD_MORE_THRESHOLD = 12;

type SortDirection = "asc" | "desc";
type SortColumn = "title" | "boardTitle" | "viewedDate";

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

const DEFAULT_SORT_STATE: SortState = {
  column: null,
  direction: "asc",
};

interface HistoryEntry {
  url: string;
  title: string;
  boardTitle: string;
  viewedDate: number;
}

interface LegacyHistoryLike {
  url?: unknown;
  title?: unknown;
  boardTitle?: unknown;
  date?: unknown;
  viewedDate?: unknown;
}

interface HistoryPageResult {
  entries: HistoryEntry[];
  hasMore: boolean;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

async function readHistoryEntriesPage(
  offset: number | undefined,
  count: number,
): Promise<HistoryPageResult> {
  const historyService = window.app?.History as
    | {
        get?: (offset?: number, count?: number) => Promise<unknown> | unknown;
      }
    | undefined;

  if (!historyService?.get) {
    return { entries: [], hasMore: false };
  }

  const raw = await historyService.get(offset, count);
  if (!Array.isArray(raw)) {
    return { entries: [], hasMore: false };
  }

  const entries = raw
    .map((value) => {
      const item = value as LegacyHistoryLike;
      const url = normalizeString(item.url);
      if (!url) {
        return null;
      }

      // 変更理由: 旧UIの履歴DBは `date` で保存されたレコードが残るため、
      // new-ui でも双方を吸収して閲覧日時を欠損させない。
      const viewedDate = normalizeLegacyTimestamp(item.viewedDate ?? item.date);

      return {
        url,
        title: normalizeString(item.title, url),
        boardTitle: normalizeString(item.boardTitle),
        viewedDate,
      } satisfies HistoryEntry;
    })
    .filter((item): item is HistoryEntry => item !== null);

  return {
    entries,
    hasMore: raw.length === count,
  };
}

const COLUMNS: ColumnDef<HistoryEntry>[] = [
  {
    key: "title",
    header: "タイトル",
    headerClassName: "simple-data-table__th--title",
    cellClassName: "simple-data-table__title",
    sortable: true,
    cell: (row) => row.title,
  },
  {
    key: "boardTitle",
    header: "板",
    headerClassName: "simple-data-table__th--history-board",
    cellClassName: "simple-data-table__history-board",
    sortable: true,
    cell: (row) => row.boardTitle || "-",
  },
  {
    key: "viewedDate",
    header: "閲覧日時",
    headerClassName: "simple-data-table__th--history-date",
    cellClassName: "simple-data-table__history-date",
    sortable: true,
    cell: (row) =>
      row.viewedDate ? formatCompactDateTime(row.viewedDate) : "-",
  },
];

interface HistoryListPageProps {
  tabId: string;
}

export const HistoryListPage: React.FC<HistoryListPageProps> = ({ tabId }) => {
  const { dispatch, state, currentPage } = useTabStore();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);

  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    pageType: "historyList",
    tabId,
    isActive: state.activeTabId === tabId && currentPage.type === "historyList",
    searchQuery,
    setSearchQuery,
  });

  const seenUrlsRef = React.useRef<Set<string>>(new Set());
  const nextOffsetRef = React.useRef(0);
  const hasMoreRef = React.useRef(true);
  const isLoadingPageRef = React.useRef(false);

  const loadNextPage = useCallback(async (reset = false) => {
    if (isLoadingPageRef.current) {
      return;
    }
    if (!reset && !hasMoreRef.current) {
      return;
    }

    isLoadingPageRef.current = true;
    setError(null);

    if (reset) {
      setLoading(true);
      seenUrlsRef.current = new Set();
      nextOffsetRef.current = 0;
      hasMoreRef.current = true;
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }

    let currentOffset = reset ? 0 : nextOffsetRef.current;
    let nextHasMore = hasMoreRef.current;
    const uniqueRows: HistoryEntry[] = [];

    try {
      // 変更理由: `History.getUnique()` の offset は raw レコード基準なので、
      // 無限読み込みでページを跨ぐと重複URLが再登場しうる。
      // new-ui では raw 履歴を段階取得し、URL単位で前段重複除外して一覧の一意性を保つ。
      while (true) {
        // 変更理由: History.get() は offset 未指定時だけ先頭ページを安全に読める。
        // 0 を渡すと内部で IDBCursor.advance(0) になって例外化するため、
        // 先頭ページは undefined、それ以降だけ正の offset を渡す。
        const page = await readHistoryEntriesPage(
          currentOffset > 0 ? currentOffset : undefined,
          PAGE_SIZE,
        );
        currentOffset += PAGE_SIZE;
        nextHasMore = page.hasMore;

        for (const row of page.entries) {
          if (seenUrlsRef.current.has(row.url)) {
            continue;
          }
          seenUrlsRef.current.add(row.url);
          uniqueRows.push(row);
        }

        if (uniqueRows.length > 0 || !nextHasMore) {
          break;
        }
      }

      nextOffsetRef.current = currentOffset;
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);
      setEntries((prev) => (reset ? uniqueRows : [...prev, ...uniqueRows]));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "閲覧履歴の読み込みに失敗しました";
      setError(message);
      if (reset) {
        setEntries([]);
      }
    } finally {
      isLoadingPageRef.current = false;
      if (reset) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, []);

  const loadEntries = useCallback(async () => {
    await loadNextPage(true);
  }, [loadNextPage]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const shouldLoadCompleteDataset =
    searchQuery.trim().length > 0 || sortState.column !== null;

  useEffect(() => {
    // 変更理由: 検索やソートは未読込ページが残っていると結果が欠けるため、
    // 明示操作時だけ残りページを順次読み切ってから一覧を確定させる。
    if (
      !shouldLoadCompleteDataset ||
      loading ||
      loadingMore ||
      error ||
      !hasMore
    ) {
      return;
    }

    void loadNextPage();
  }, [
    error,
    hasMore,
    loadNextPage,
    loading,
    loadingMore,
    shouldLoadCompleteDataset,
  ]);

  const handleSort = useCallback((key: string) => {
    if (!COLUMNS.some((column) => column.key === key)) {
      return;
    }

    const column = key as SortColumn;
    setSortState((prev) => {
      if (prev.column !== column) {
        return { column, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { column, direction: "desc" };
      }
      // 3段階ソート: asc -> desc -> default(未ソート)
      return DEFAULT_SORT_STATE;
    });
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const rows = normalizedQuery
      ? entries.filter((entry) =>
          `${entry.title} ${entry.boardTitle}`
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : entries;

    if (!sortState.column) {
      return rows;
    }

    const sorted = [...rows];
    sorted.sort((a, b) => {
      let result = 0;
      switch (sortState.column) {
        case "title":
          result = a.title.localeCompare(b.title, "ja");
          break;
        case "boardTitle":
          result = a.boardTitle.localeCompare(b.boardTitle, "ja");
          break;
        case "viewedDate":
          result = a.viewedDate - b.viewedDate;
          break;
      }
      return sortState.direction === "asc" ? result : -result;
    });

    return sorted;
  }, [entries, searchQuery, sortState]);

  const openEntry = useCallback(
    (entry: HistoryEntry) => {
      const parsed = parseInternalBrowserPage(entry.url);
      if (!parsed) return;

      dispatch({
        type: "NAVIGATE",
        page: {
          ...parsed,
          title: entry.title,
          ...(parsed.type === "threadList"
            ? { boardTitle: entry.boardTitle || entry.title }
            : {}),
        },
      });
    },
    [dispatch],
  );

  const openEntryInNewTab = useCallback(
    (entry: HistoryEntry) => {
      const parsed = parseInternalBrowserPage(entry.url);
      if (!parsed) return;

      dispatch({
        type: "OPEN_IN_NEW_TAB",
        page: {
          ...parsed,
          title: entry.title,
          ...(parsed.type === "threadList"
            ? { boardTitle: entry.boardTitle || entry.title }
            : {}),
        },
      });
    },
    [dispatch],
  );

  const handleEndReached = useCallback(() => {
    if (
      shouldLoadCompleteDataset ||
      loading ||
      loadingMore ||
      error ||
      !hasMore
    ) {
      return;
    }

    void loadNextPage();
  }, [
    error,
    hasMore,
    loadNextPage,
    loading,
    loadingMore,
    shouldLoadCompleteDataset,
  ]);

  if (loading && entries.length === 0) {
    return <div className="page-status">読み込み中...</div>;
  }

  if (error && entries.length === 0) {
    return (
      <div className="page-status page-status--error">
        <p>{error}</p>
        <button
          className="page-status__retry"
          onClick={() => void loadEntries()}
        >
          再試行
        </button>
      </div>
    );
  }

  return (
    <div className="thread-list-page history-list-page">
      {isFilterOpen ? (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={closeFilterToolbar}
          hitCount={filtered.length}
        />
      ) : null}
      {error ? <div className="thread-list-page__notice">{error}</div> : null}
      <div className="history-list-page__table">
        <VirtualizedDataTable
          columns={COLUMNS}
          rows={filtered}
          getRowKey={(row) => row.url}
          onRowClick={openEntry}
          onRowMiddleClick={openEntryInNewTab}
          sortColumn={sortState.column ?? undefined}
          sortDirection={sortState.direction}
          onSort={handleSort}
          estimatedRowHeight={52}
          endReachedThreshold={LOAD_MORE_THRESHOLD}
          onEndReached={handleEndReached}
        />
      </div>
    </div>
  );
};
