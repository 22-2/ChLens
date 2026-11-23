import { normalizeReadStateUrl } from "packages/chlib/src/index";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createLogger } from "src/app/logger";
import { container } from "src/service-container/index";
import { ListInitialLoading } from "src/view/browser/components/ListInitialLoading";
import { ListRefreshIndicator } from "src/view/browser/components/ListRefreshIndicator";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { ColumnDef } from "src/view/browser/components/SimpleDataTable";
import { VirtualizedDataTable } from "src/view/browser/components/VirtualizedDataTable";
import { type PagedListFetchRequest, usePagedList } from "src/view/browser/hooks/use-paged-list";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabDispatch, useTabViewState } from "src/view/browser/state/tabs/use-tab-store";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { formatCompactDateTime, normalizeLegacyTimestamp } from "src/view/browser/utils/date-time";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";
import { matchesSearchQuery } from "src/view/browser/utils/search-normalize";

const logger = createLogger("view/browser");

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
  // 変更理由: 既読保存側と履歴側の掲示板ホスト正規化がずれて未読数が欠けないよう共有規則を使う。
  return normalizeReadStateUrl(url);
}

async function readHistoryUnreadCountIndex(): Promise<Map<string, number>> {
  try {
    // 変更理由: window.app 経由の既読情報の取得をやめ、サービスコンテナだけを入口にする
    // （docs/plans/legacy-window-app-plan.md の Phase 1）。
    const raw = await container.readState.getAll();
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
        Math.trunc(normalizeNumber(item.received)) - Math.trunc(normalizeNumber(item.read)),
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

/** 閲覧履歴の1ページを読む。未読数はあとで既読情報と突き合わせるため 0 で返す。 */
async function readHistoryEntriesPage(
  offset: number | undefined,
  count: number,
): Promise<HistoryPageResult> {
  // window.app ではなくサービスコンテナの閲覧履歴から読む（legacy-window-app-plan の Phase 1）。
  const raw = await container.history.get(offset, count);
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
        unreadCount: 0,
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
    searchable: true,
    cell: (row) => row.title,
  },
  {
    key: "boardTitle",
    header: "板",
    headerClassName: "simple-data-table__th--history-board",
    cellClassName: "simple-data-table__history-board",
    sortable: true,
    searchable: true,
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
    cell: (row) => (row.viewedDate ? formatCompactDateTime(row.viewedDate) : "-"),
  },
];

const COLUMN_VISIBILITY_STORAGE_KEY = "chlens_browser_history_list_columns_visibility";
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
  const { state: persistedViewState, update: updateViewState } = useTabViewState(tabId, {
    type: "historyList",
    title: "閲覧履歴",
  });
  const [contextMenuState, setContextMenuState] = useState<{
    entry: HistoryEntry;
    x: number;
    y: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => persistedViewState.searchQuery ?? "");
  const [sortState, setSortState] = useState<SortState>(() => {
    const column = persistedViewState.sortColumn;
    return {
      column:
        typeof column === "string" && COLUMNS.some((candidate) => candidate.key === column)
          ? (column as SortColumn)
          : null,
      direction: persistedViewState.sortDirection === "desc" ? "desc" : "asc",
    };
  });

  useEffect(() => {
    updateViewState({
      searchQuery,
      sortColumn: sortState.column,
      sortDirection: sortState.direction,
    });
  }, [searchQuery, sortState, updateViewState]);

  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    tabId,
    isActive,
    searchQuery,
    setSearchQuery,
  });

  const unreadCountIndexRef = React.useRef<Map<string, number>>(new Map());
  const wasActiveRef = React.useRef(isActive);

  const fetchHistoryRange = useCallback(
    async ({ offset, targetOffset, loadedRows }: PagedListFetchRequest<HistoryEntry>) => {
      const isReset = offset === 0;
      // 変更理由: 既読情報の全件取得と閲覧履歴の取得を順に待つと、一覧が出るまでの時間が両方の合計になる。
      // 並べて読み、読み終えてから未読数を突き合わせる。
      const unreadCountIndexPromise = isReset
        ? readHistoryUnreadCountIndex()
        : Promise.resolve(unreadCountIndexRef.current);
      const seenUrls = new Set(loadedRows.map((row) => row.url));
      const uniqueRows: HistoryEntry[] = [];
      let currentOffset = offset;
      let hasMore = true;

      // 変更理由: `History.getUnique()` の offset は raw レコード基準なので、
      // 無限読み込みでページを跨ぐと重複URLが再登場しうる。
      // raw 履歴を段階取得し、URL単位で前段重複除外して一覧の一意性を保つ。
      // 読み直しでは targetOffset まで読み、スクロールで読み込んだ範囲を縮めない。
      while (hasMore && (currentOffset < targetOffset || uniqueRows.length === 0)) {
        // 変更理由: History.get() は offset 未指定時だけ先頭ページを安全に読める。
        // 0 を渡すと内部で IDBCursor.advance(0) になって例外化するため、
        // 先頭ページは undefined、それ以降だけ正の offset を渡す。
        const page = await readHistoryEntriesPage(
          currentOffset > 0 ? currentOffset : undefined,
          PAGE_SIZE,
        );
        currentOffset += PAGE_SIZE;
        hasMore = page.hasMore;

        for (const row of page.entries) {
          if (seenUrls.has(row.url)) {
            continue;
          }
          seenUrls.add(row.url);
          uniqueRows.push(row);
        }
      }

      const unreadCountIndex = await unreadCountIndexPromise;
      unreadCountIndexRef.current = unreadCountIndex;
      return {
        rows: uniqueRows.map((row) => ({
          ...row,
          unreadCount: unreadCountIndex.get(normalizeReadStateLookupUrl(row.url)) ?? 0,
        })),
        nextOffset: currentOffset,
        hasMore,
      };
    },
    [],
  );

  const shouldLoadCompleteDataset = searchQuery.trim().length > 0 || sortState.column !== null;

  const {
    rows: entries,
    loadingMore,
    error,
    reload: loadEntries,
    loadMore: handleEndReached,
    updateRows,
    isInitialLoading,
    showInitialLoading,
    showRefreshing,
  } = usePagedList<HistoryEntry>({
    page: "historyList",
    pageSize: PAGE_SIZE,
    errorMessage: "閲覧履歴の読み込みに失敗しました",
    fetchRange: fetchHistoryRange,
    loadCompleteDataset: shouldLoadCompleteDataset,
  });

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
      updateRows((prev) =>
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
      updateRows((prev) =>
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
  }, [updateRows]);

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
    const rows = searchQuery.trim()
      ? entries.filter((entry) =>
          [entry.title, entry.boardTitle].some((text) => matchesSearchQuery(text, searchQuery)),
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

      dispatch(
        tabActions.navigate({
          ...parsed,
          title: entry.title,
          ...(parsed.type === "threadList" ? { boardTitle: entry.boardTitle || entry.title } : {}),
        }),
      );
    },
    [dispatch],
  );

  const openEntryInNewTab = useCallback(
    (entry: HistoryEntry) => {
      const parsed = parseInternalBrowserPage(entry.url);
      if (!parsed) return;

      // ミドルクリックはバックグラウンドで開く（設定に関わらず常にバックグラウンドタブ）
      dispatch(
        tabActions.openInNewTab(
          {
            ...parsed,
            title: entry.title,
            ...(parsed.type === "threadList"
              ? { boardTitle: entry.boardTitle || entry.title }
              : {}),
          },
          { background: true },
        ),
      );
    },
    [dispatch],
  );

  const removeHistoryEntry = useCallback(async (entry: HistoryEntry) => {
    try {
      await container.history.remove(entry.url);
      container.toast.success("閲覧履歴から削除しました");
    } catch (error) {
      logger.error("閲覧履歴の削除に失敗しました", error);
      container.toast.error(
        error instanceof Error ? error.message : "閲覧履歴の削除に失敗しました",
      );
    }
  }, []);

  if (isInitialLoading) {
    return <ListInitialLoading visible={showInitialLoading} label="履歴を読み込み中" />;
  }

  if (error && entries.length === 0) {
    return (
      <div className="page-status page-status--error">
        <p>{error}</p>
        <button className="page-status__retry" onClick={() => void loadEntries()}>
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
          highlightQuery={searchQuery}
          getRowKey={(row) => row.url}
          getRowTooltip={(row) => row.title}
          onRowClick={openEntry}
          onRowMiddleClick={openEntryInNewTab}
          onRowContextMenu={(entry, x, y) => setContextMenuState({ entry, x, y })}
          sortColumn={sortState.column ?? undefined}
          sortDirection={sortState.direction}
          onSort={handleSort}
          estimatedRowHeight={52}
          loadingMore={loadingMore}
          endReachedThreshold={LOAD_MORE_THRESHOLD}
          onEndReached={handleEndReached}
          columnVisibilityStorageKey={COLUMN_VISIBILITY_STORAGE_KEY}
          columnVisibilityLockedKeys={COLUMN_VISIBILITY_LOCKED_KEYS}
        />
      </div>
      <ListRefreshIndicator visible={showRefreshing} />
      {contextMenuState && isActive ? (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          items={[
            {
              id: "remove-history-entry",
              label: "閲覧履歴から削除",
              danger: true,
              onSelect: () => void removeHistoryEntry(contextMenuState.entry),
            },
          ]}
          onClose={() => setContextMenuState(null)}
        />
      ) : null}
    </div>
  );
};
