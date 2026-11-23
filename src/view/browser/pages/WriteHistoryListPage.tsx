import { Download } from "lucide-react";
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
import {
  type TabAction,
  useTabDispatch,
  useTabViewState,
} from "src/view/browser/state/tabs/use-tab-store";
import { Button } from "src/view/browser/ui/Button";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { downloadBlob } from "src/view/browser/utils/blob-download";
import { formatCompactDateTime, normalizeLegacyTimestamp } from "src/view/browser/utils/date-time";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";
import { matchesSearchQuery } from "src/view/browser/utils/search-normalize";
import { requestThreadResJump } from "src/view/browser/utils/thread-read-state";

const logger = createLogger("view/browser");

// 変更理由: 以前は5000件を一度に読んで全行をDOMに描いていたため、書き込みが多いと開くまで待たされた。
// 先頭から少しずつ読み、表は仮想化して見えている行だけを描く。
const PAGE_SIZE = 500;
const LOAD_MORE_THRESHOLD = 12;

type SortDirection = "asc" | "desc";
type SortColumn = "title" | "writtenRes" | "name" | "mail" | "message" | "writtenDate";

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

const DEFAULT_SORT_STATE: SortState = {
  column: null,
  direction: "asc",
};

interface WriteHistoryEntry {
  url: string;
  title: string;
  writtenRes: number;
  name: string;
  mail: string;
  message: string;
  writtenDate: number;
  originalIndex: number;
}

interface LegacyWriteHistoryLike {
  url?: unknown;
  title?: unknown;
  res?: unknown;
  writtenRes?: unknown;
  name?: unknown;
  mail?: unknown;
  message?: unknown;
  date?: unknown;
  writtenDate?: unknown;
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

interface WriteHistoryPageResult {
  entries: WriteHistoryEntry[];
  hasMore: boolean;
}

async function readWriteHistoryEntries(
  offset: number,
  count: number,
): Promise<WriteHistoryPageResult> {
  // window.app ではなくサービスコンテナの書き込み履歴から読む（legacy-window-app-plan の Phase 1）。
  // 先頭ページは閲覧履歴と同じく offset を省略し、保存先ごとの 0 の扱いの違いに左右されないようにする。
  const raw = await container.writeHistory.get(offset > 0 ? offset : undefined, count);
  if (!Array.isArray(raw)) {
    return { entries: [], hasMore: false };
  }

  const entries = raw
    .map((value, index) => {
      const item = value as LegacyWriteHistoryLike;
      const url = normalizeString(item.url);
      if (!url) {
        return null;
      }

      // 変更理由: 旧UIの書込履歴は `date` フィールドで残っている場合があるため、
      // new-ui でも両形式を受けて日時列を欠損させない。
      const parsedDate = normalizeLegacyTimestamp(item.writtenDate ?? item.date);

      return {
        url,
        title: normalizeString(item.title, url),
        writtenRes: Math.max(0, Math.trunc(normalizeNumber(item.writtenRes ?? item.res))),
        name: normalizeString(item.name),
        mail: normalizeString(item.mail),
        message: normalizeString(item.message),
        writtenDate: parsedDate,
        // 同じスレの同じレス番が複数残っていても行のキーが重ならないよう、保存先の並び順を使う。
        originalIndex: offset + index,
      } satisfies WriteHistoryEntry;
    })
    .filter((item): item is WriteHistoryEntry => item !== null);

  return { entries, hasMore: raw.length === count };
}

async function fetchWriteHistoryRange({
  offset,
  targetOffset,
}: PagedListFetchRequest<WriteHistoryEntry>) {
  const count = targetOffset - offset;
  const page = await readWriteHistoryEntries(offset, count);
  return { rows: page.entries, nextOffset: offset + count, hasMore: page.hasMore };
}

export function navigateToWriteHistoryEntry(
  dispatch: React.Dispatch<TabAction>,
  entry: Pick<WriteHistoryEntry, "url" | "title" | "writtenRes">,
  mode: "current" | "new-tab" = "current",
): void {
  const parsed = parseInternalBrowserPage(entry.url);
  if (!parsed || parsed.type !== "thread") {
    return;
  }

  requestThreadResJump(parsed.threadUrl, entry.writtenRes);
  dispatch({
    type: mode === "new-tab" ? "OPEN_IN_NEW_TAB" : "NAVIGATE",
    page: {
      ...parsed,
      title: entry.title,
    },
    ...(mode === "new-tab" ? { background: true } : {}),
  });
}

const COLUMNS: ColumnDef<WriteHistoryEntry>[] = [
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
    key: "writtenRes",
    header: "レス",
    headerClassName: "simple-data-table__th--writehistory-res",
    cellClassName: "simple-data-table__writehistory-res",
    sortable: true,
    cell: (row) => (row.writtenRes > 0 ? row.writtenRes : "-"),
  },
  {
    key: "name",
    header: "名前",
    headerClassName: "simple-data-table__th--writehistory-name",
    cellClassName: "simple-data-table__writehistory-name",
    sortable: true,
    searchable: true,
    cell: (row) => row.name || "-",
  },
  {
    key: "mail",
    header: "メール",
    headerClassName: "simple-data-table__th--writehistory-mail",
    cellClassName: "simple-data-table__writehistory-mail",
    sortable: true,
    searchable: true,
    cell: (row) => row.mail || "-",
  },
  {
    key: "message",
    header: "本文",
    cellClassName: "simple-data-table__writehistory-message",
    sortable: true,
    searchable: true,
    cell: (row) => row.message || "-",
  },
  {
    key: "writtenDate",
    header: "書込日時",
    headerClassName: "simple-data-table__th--writehistory-date",
    cellClassName: "simple-data-table__writehistory-date",
    sortable: true,
    cell: (row) => (row.writtenDate ? formatCompactDateTime(row.writtenDate) : "-"),
  },
];

const COLUMN_VISIBILITY_STORAGE_KEY = "chlens_browser_write_history_list_columns_visibility";

/** 本文は表では1行に省略するため、ツールチップでタイトルと本文の全文を見せる。 */
function formatWriteHistoryTooltip(row: WriteHistoryEntry): string {
  return row.message
    ? `${row.title}
${row.message}`
    : row.title;
}
const COLUMN_VISIBILITY_LOCKED_KEYS = ["title"] as const;

interface WriteHistoryListPageProps {
  tabId: string;
  isActive: boolean;
  refreshKey: number;
}

export const WriteHistoryListPage: React.FC<WriteHistoryListPageProps> = ({
  tabId,
  isActive,
  refreshKey,
}) => {
  // タブ切り替えなど他タブ操作のたびにフル状態を再購読して再レンダリングされないよう、
  // dispatch のみ取得する安定したフックを使う。isActive は親から props で受け取る。
  const dispatch = useTabDispatch();
  const { state: persistedViewState, update: updateViewState } = useTabViewState(tabId, {
    type: "writeHistoryList",
    title: "書き込み履歴",
  });
  const [isExportingKakikomi, setIsExportingKakikomi] = useState(false);
  const [contextMenuState, setContextMenuState] = useState<{
    entry: WriteHistoryEntry;
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

  const shouldLoadCompleteDataset = searchQuery.trim().length > 0 || sortState.column !== null;

  const {
    rows: entries,
    loadingMore,
    error,
    reload: loadEntries,
    loadMore: handleEndReached,
    isInitialLoading,
    showInitialLoading,
    showRefreshing,
  } = usePagedList<WriteHistoryEntry>({
    page: "writeHistoryList",
    pageSize: PAGE_SIZE,
    errorMessage: "書き込み履歴の読み込みに失敗しました",
    fetchRange: fetchWriteHistoryRange,
    loadCompleteDataset: shouldLoadCompleteDataset,
  });

  useEffect(() => {
    // 変更理由: ナビバー更新ボタンの RELOAD を受けて、
    // 書き込み履歴一覧でも明示的に最新データを再取得できるようにする。
    void loadEntries();
  }, [loadEntries, refreshKey]);

  useEffect(() => {
    const handleWriteHistoryUpdated = () => {
      // 変更理由: 書き込み履歴タブは hidden のまま保持されるため、
      // 投稿直後の仮追加や確定更新を通知で取り込み stale 一覧を避ける。
      void loadEntries();
    };

    container.message.on("write_history_updated", handleWriteHistoryUpdated);

    return () => {
      container.message.off("write_history_updated", handleWriteHistoryUpdated);
    };
  }, [loadEntries]);

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
          [entry.title, entry.name, entry.mail, entry.message].some((text) =>
            matchesSearchQuery(text, searchQuery),
          ),
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
        case "writtenRes":
          result = a.writtenRes - b.writtenRes;
          break;
        case "name":
          result = a.name.localeCompare(b.name, "ja");
          break;
        case "mail":
          result = a.mail.localeCompare(b.mail, "ja");
          break;
        case "message":
          result = a.message.localeCompare(b.message, "ja");
          break;
        case "writtenDate":
          result = a.writtenDate - b.writtenDate;
          break;
      }
      return sortState.direction === "asc" ? result : -result;
    });

    return sorted;
  }, [entries, searchQuery, sortState]);

  const openEntry = useCallback(
    (entry: WriteHistoryEntry) => {
      navigateToWriteHistoryEntry(dispatch, entry, "current");
    },
    [dispatch],
  );

  const openEntryInNewTab = useCallback(
    (entry: WriteHistoryEntry) => {
      navigateToWriteHistoryEntry(dispatch, entry, "new-tab");
    },
    [dispatch],
  );

  const removeWriteHistoryEntry = useCallback(async (entry: WriteHistoryEntry) => {
    try {
      await container.writeHistory.remove(entry.url, entry.writtenRes);
      container.toast.success("書き込み履歴から削除しました");
    } catch (error) {
      logger.error("書き込み履歴の削除に失敗しました", error);
      container.toast.error(
        error instanceof Error ? error.message : "書き込み履歴の削除に失敗しました",
      );
    }
  }, []);

  const exportKakikomiTxt = useCallback(async () => {
    setIsExportingKakikomi(true);
    try {
      const rows = await container.writeHistory.getAll();
      // 変更理由: Shift-JIS変換表はエクスポート時だけ読み込み、通常の画面起動を重くしない。
      const { encodeKakikomiTxt } = await import("src/features/write/browser/kakikomi-export");
      const encoded = encodeKakikomiTxt(
        rows.map(({ url, title, name, mail, message, date }) => ({
          url,
          title,
          name,
          mail,
          message,
          date,
        })),
      );
      const blobBytes = new Uint8Array(encoded);
      const blob = new Blob([blobBytes.buffer], { type: "text/plain;charset=shift_jis" });
      downloadBlob(blob, "kakikomi.txt");
      container.toast.success("書き込み履歴をkakikomi.txtへエクスポートしました");
    } catch (error) {
      logger.error("kakikomi.txtのエクスポートに失敗しました", error);
      container.toast.error(
        error instanceof Error ? error.message : "kakikomi.txtのエクスポートに失敗しました",
      );
    } finally {
      setIsExportingKakikomi(false);
    }
  }, []);

  if (isInitialLoading) {
    return <ListInitialLoading visible={showInitialLoading} label="書き込み履歴を読み込み中" />;
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
    <div className="thread-list-page history-list-page write-history-list-page">
      {error && <div className="thread-list-page__notice">{error}</div>}
      <div className="write-history-list-page__toolbar">
        <Button
          variant="subtle"
          loading={isExportingKakikomi}
          onClick={() => void exportKakikomiTxt()}
        >
          <Download size={16} />
          kakikomi.txtをエクスポート
        </Button>
      </div>
      {isFilterOpen ? (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={closeFilterToolbar}
          hitCount={filtered.length}
        />
      ) : null}
      <div className="history-list-page__table">
        <VirtualizedDataTable
          columns={COLUMNS}
          rows={filtered}
          highlightQuery={searchQuery}
          getRowKey={(row) => `${row.url}:${row.originalIndex}`}
          getRowTooltip={formatWriteHistoryTooltip}
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
              id: "remove-write-history-entry",
              label: "書き込み履歴から削除",
              danger: true,
              onSelect: () => void removeWriteHistoryEntry(contextMenuState.entry),
            },
          ]}
          onClose={() => setContextMenuState(null)}
        />
      ) : null}
    </div>
  );
};
