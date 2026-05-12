import React, { useCallback, useEffect, useMemo, useState } from "react";
import { container } from "src/service-container/index";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { ColumnDef } from "src/view/browser/components/SimpleDataTable";
import { VirtualizedDataTable } from "src/view/browser/components/VirtualizedDataTable";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import { useTabDispatch } from "src/view/browser/hooks/use-tab-store";
import {
  formatCompactDateTime,
  normalizeLegacyTimestamp,
} from "src/view/browser/utils/date-time";
import {
  getLegacyHistoryService,
  getLegacyReadStateService,
} from "src/view/browser/utils/legacy-app";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";

const PAGE_SIZE = 500;
const LOAD_MORE_THRESHOLD = 12;

type SortDirection = "asc" | "desc";
type SortColumn = "title" | "boardTitle" | "unreadCount" | "viewedDate";

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
  unreadCount: number;
  viewedDate: number;
}

interface LegacyHistoryLike {
  url?: unknown;
  title?: unknown;
  boardTitle?: unknown;
  date?: unknown;
  viewedDate?: unknown;
}

interface LegacyReadStateLike {
  url?: unknown;
  read?: unknown;
  received?: unknown;
}

interface HistoryPageResult {
  entries: HistoryEntry[];
  hasMore: boolean;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeReadStateLookupUrl(url: string): string {
  try {
    const parsedUrl = new window.URL(url);
    // 変更理由: ReadState.getAll() の IndexedDB 実装は *.5ch.io に正規化された URL を返すため、
    // 履歴側も同じ規則で揃えて未読数の突き合わせ漏れを防ぐ。
    if (parsedUrl.hostname.endsWith(".5ch.io")) {
      parsedUrl.hostname = "*.5ch.io";
    }
    return parsedUrl.href;
  } catch {
    return url;
  }
}

async function readHistoryUnreadCountIndex(): Promise<Map<string, number>> {
  const readStateService = getLegacyReadStateService();

  if (!readStateService?.getAll) {
    return new Map();
  }

  try {
    const raw = await readStateService.getAll();
    if (!Array.isArray(raw)) {
      return new Map();
    }

    const unreadCountIndex = new Map<string, number>();
    for (const value of raw) {
      const item = value as LegacyReadStateLike;
      const url = normalizeString(item.url);
      if (!url) {
        continue;
      }

      const unreadCount = Math.max(
        Math.trunc(normalizeNumber(item.received)) -
          Math.trunc(normalizeNumber(item.read)),
        0,
      );

      const lookupUrl = normalizeReadStateLookupUrl(url);
      const prevUnreadCount = unreadCountIndex.get(lookupUrl) ?? 0;
      if (unreadCount > prevUnreadCount) {
        unreadCountIndex.set(lookupUrl, unreadCount);
      }
    }

    return unreadCountIndex;
  } catch {
    // 未読数取得に失敗しても履歴一覧自体は表示を続ける。
    return new Map();
  }
}

async function readHistoryEntriesPage(
  offset: number | undefined,
  count: number,
  unreadCountIndex: ReadonlyMap<string, number>,
): Promise<HistoryPageResult> {
  const historyService = getLegacyHistoryService();

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
        unreadCount:
          unreadCountIndex.get(normalizeReadStateLookupUrl(url)) ?? 0,
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
    key: "unreadCount",
    header: "未読",
    headerClassName: "simple-data-table__th--count",
    cellClassName: "simple-data-table__count",
    sortable: true,
    cell: (row) => (row.unreadCount > 0 ? row.unreadCount : ""),
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

const COLUMN_VISIBILITY_STORAGE_KEY =
  "chlens_browser_history_list_columns_visibility";
const COLUMN_VISIBILITY_LOCKED_KEYS = ["title"] as const;

interface HistoryListPageProps {
  tabId: string;
  isActive: boolean;
  refreshKey: number;
}

export const HistoryListPage: React.FC<HistoryListPageProps> = ({
  tabId,
  isActive,
  refreshKey,
}) => {
  // タブ切り替えなど他タブ操作のたびにフル状態を再購読して再レンダリングされないよう、
  // dispatch のみ取得する安定したフックを使う。isActive は親から props で受け取る。
  const dispatch = useTabDispatch();
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
    isActive,
    searchQuery,
    setSearchQuery,
  });

  const seenUrlsRef = React.useRef<Set<string>>(new Set());
  const nextOffsetRef = React.useRef(0);
  const hasMoreRef = React.useRef(true);
  const isLoadingPageRef = React.useRef(false);
  const unreadCountIndexRef = React.useRef<Map<string, number>>(new Map());
  const wasActiveRef = React.useRef(isActive);

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
      unreadCountIndexRef.current = await readHistoryUnreadCountIndex();
    } else {
      setLoadingMore(true);
    }

    let currentOffset = reset ? 0 : nextOffsetRef.current;
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
          unreadCountIndexRef.current,
        );
        currentOffset += PAGE_SIZE;
        hasMoreRef.current = page.hasMore;
        setHasMore(page.hasMore);

        for (const row of page.entries) {
          if (seenUrlsRef.current.has(row.url)) {
            continue;
          }
          seenUrlsRef.current.add(row.url);
          uniqueRows.push(row);
        }

        if (uniqueRows.length > 0 || !page.hasMore) {
          break;
        }
      }

      nextOffsetRef.current = currentOffset;
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
    // 変更理由: ナビバーの「更新」は RELOAD で reloadKey を進める実装なので、
    // 履歴ページ側で refreshKey 変化を購読して明示的に再読込する。
    void loadEntries();
  }, [loadEntries, refreshKey]);

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      // 変更理由: hidden のまま保持された履歴ページで通知を取りこぼしても、
      // 前面復帰時に再同期して stale 一覧のまま戻るのを防ぐ。
      void loadEntries();
    }

    wasActiveRef.current = isActive;
  }, [isActive, loadEntries]);

  useEffect(() => {
    const handleHistoryUpdated = () => {
      // 変更理由: 閲覧履歴ページは hidden のまま保持されるため、
      // スレ閲覧後に戻った時点で新着行を反映できるよう保存通知で先に再読込する。
      void loadEntries();
    };

    container.message.on("history_updated", handleHistoryUpdated);

    return () => {
      container.message.off("history_updated", handleHistoryUpdated);
    };
  }, [loadEntries]);

  useEffect(() => {
    const handleReadStateUpdated = ({
      read_state: readState,
    }: {
      read_state?: LegacyReadStateLike;
    }) => {
      const url = normalizeString(readState?.url);
      if (!url) {
        return;
      }

      const unreadCount = Math.max(
        Math.trunc(normalizeNumber(readState?.received)) -
          Math.trunc(normalizeNumber(readState?.read)),
        0,
      );
      const lookupUrl = normalizeReadStateLookupUrl(url);
      unreadCountIndexRef.current.set(lookupUrl, unreadCount);
      setEntries((prev) =>
        prev.map((entry) =>
          normalizeReadStateLookupUrl(entry.url) === lookupUrl
            ? {
                ...entry,
                unreadCount,
              }
            : entry,
        ),
      );
    };

    const handleReadStateRemoved = ({ url }: { url?: string }) => {
      const lookupUrl = normalizeReadStateLookupUrl(normalizeString(url));
      if (!lookupUrl) {
        return;
      }

      unreadCountIndexRef.current.delete(lookupUrl);
      // 変更理由: 閲覧履歴タブも hidden のまま状態保持されるため、
      // スレを読んだ後に戻った時点で未読数が追従している状態を維持する。
      setEntries((prev) =>
        prev.map((entry) =>
          normalizeReadStateLookupUrl(entry.url) === lookupUrl
            ? {
                ...entry,
                unreadCount: 0,
              }
            : entry,
        ),
      );
    };

    container.message.on("read_state_updated", handleReadStateUpdated);
    container.message.on("read_state_removed", handleReadStateRemoved);

    return () => {
      container.message.off("read_state_updated", handleReadStateUpdated);
      container.message.off("read_state_removed", handleReadStateRemoved);
    };
  }, []);

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
        case "unreadCount":
          result = a.unreadCount - b.unreadCount;
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
          columnVisibilityStorageKey={COLUMN_VISIBILITY_STORAGE_KEY}
          columnVisibilityLockedKeys={COLUMN_VISIBILITY_LOCKED_KEYS}
        />
      </div>
    </div>
  );
};
