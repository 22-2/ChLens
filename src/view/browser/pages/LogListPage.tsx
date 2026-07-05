import React, { useCallback, useEffect, useMemo, useState } from "react";
import Cache, { type LogRecord } from "src/core/Cache";
import { container } from "src/service-container/index";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { ColumnDef } from "src/view/browser/components/SimpleDataTable";
import { VirtualizedDataTable } from "src/view/browser/components/VirtualizedDataTable";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import { useTabDispatch } from "src/view/browser/hooks/use-tab-store";
import { formatCompactDateTime } from "src/view/browser/utils/date-time";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";

type SortDirection = "asc" | "desc";
type SortColumn = "title" | "boardTitle" | "resLength" | "lastUpdated";

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

const DEFAULT_SORT_STATE: SortState = {
  column: null,
  direction: "asc",
};

interface LogEntry {
  url: string;
  threadUrl: string;
  title: string;
  boardTitle: string;
  resLength: number;
  lastUpdated: number;
}

/** 板URLから表示用の板名（host/board）を導出する。 */
function deriveBoardLabel(boardUrl: string, threadUrl: string): string {
  const source = boardUrl || threadUrl;
  try {
    const parsed = new window.URL(source);
    const pathPart = parsed.pathname.replace(/^\/|\/$/g, "").split("/")[0];
    return pathPart ? `${parsed.hostname}/${pathPart}` : parsed.hostname;
  } catch {
    return "";
  }
}

function toLogEntry(record: LogRecord): LogEntry {
  return {
    url: record.url,
    threadUrl: record.threadUrl,
    title: record.title || record.threadUrl,
    boardTitle:
      record.boardTitle || deriveBoardLabel(record.boardUrl, record.threadUrl),
    resLength: record.resLength ?? 0,
    lastUpdated: record.lastUpdated,
  };
}

const COLUMNS: ColumnDef<LogEntry>[] = [
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
    key: "resLength",
    header: "レス",
    headerClassName: "simple-data-table__th--count",
    cellClassName: "simple-data-table__count",
    sortable: true,
    cell: (row) => (row.resLength > 0 ? row.resLength : ""),
  },
  {
    key: "lastUpdated",
    header: "取得日時",
    headerClassName: "simple-data-table__th--history-date",
    cellClassName: "simple-data-table__history-date",
    sortable: true,
    cell: (row) =>
      row.lastUpdated ? formatCompactDateTime(row.lastUpdated) : "-",
  },
];

const COLUMN_VISIBILITY_STORAGE_KEY = "chlens_browser_log_list_columns_visibility";
const COLUMN_VISIBILITY_LOCKED_KEYS = ["title"] as const;

interface LogListPageProps {
  tabId: string;
  isActive: boolean;
  refreshKey: number;
}

export const LogListPage: React.FC<LogListPageProps> = ({
  tabId,
  isActive,
  refreshKey,
}) => {
  const dispatch = useTabDispatch();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  // 既定はタイトル検索。ボタンで本文（全文）検索に切り替える。
  const [searchMode, setSearchMode] = useState<"title" | "body">("title");
  // 本文検索の結果（url 集合）。null のときは本文検索未実行。
  const [bodyMatchedUrls, setBodyMatchedUrls] = useState<Set<string> | null>(
    null,
  );

  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    pageType: "logList",
    tabId,
    isActive,
    searchQuery,
    setSearchQuery,
  });

  const wasActiveRef = React.useRef(isActive);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const logs = await Cache.listLogs();
      setEntries(logs.map(toLogEntry));
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログの読み込みに失敗しました");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries, refreshKey]);

  // 本文検索: モードが body かつクエリがある時だけ、保存ログ本文を全文検索する。
  useEffect(() => {
    if (searchMode !== "body") {
      setBodyMatchedUrls(null);
      return;
    }
    const query = searchQuery.trim();
    if (query === "") {
      setBodyMatchedUrls(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const results = await Cache.searchLogs(query);
        if (!cancelled) {
          setBodyMatchedUrls(new Set(results.map((r) => r.url)));
        }
      } catch {
        if (!cancelled) {
          setBodyMatchedUrls(new Set());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchMode, searchQuery]);

  useEffect(() => {
    // hidden のまま保持されたログページが、前面復帰時に新着を取りこぼさないよう再同期する。
    if (isActive && !wasActiveRef.current) {
      void loadEntries();
    }
    wasActiveRef.current = isActive;
  }, [isActive, loadEntries]);

  useEffect(() => {
    // スレ閲覧でログが追加/更新されたら一覧を再読込する（閲覧履歴と同じパターン）。
    const handleLogUpdated = () => {
      void loadEntries();
    };
    container.message.on("log_updated", handleLogUpdated);
    return () => {
      container.message.off("log_updated", handleLogUpdated);
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
      return DEFAULT_SORT_STATE;
    });
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    let rows = entries;
    if (normalizedQuery) {
      if (searchMode === "body") {
        // 本文検索: searchLogs の結果 url 集合で絞り込む（未実行なら全件のまま）。
        rows = bodyMatchedUrls
          ? entries.filter((entry) => bodyMatchedUrls.has(entry.url))
          : entries;
      } else {
        rows = entries.filter((entry) =>
          `${entry.title} ${entry.boardTitle}`
            .toLowerCase()
            .includes(normalizedQuery),
        );
      }
    }

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
        case "resLength":
          result = a.resLength - b.resLength;
          break;
        case "lastUpdated":
          result = a.lastUpdated - b.lastUpdated;
          break;
      }
      return sortState.direction === "asc" ? result : -result;
    });
    return sorted;
  }, [entries, searchQuery, searchMode, bodyMatchedUrls, sortState]);

  const openEntry = useCallback(
    (entry: LogEntry) => {
      const parsed = parseInternalBrowserPage(entry.threadUrl);
      if (!parsed) return;
      dispatch({
        type: "NAVIGATE",
        page: { ...parsed, title: entry.title },
      });
    },
    [dispatch],
  );

  const openEntryInNewTab = useCallback(
    (entry: LogEntry) => {
      const parsed = parseInternalBrowserPage(entry.threadUrl);
      if (!parsed) return;
      // ミドルクリックは常にバックグラウンドタブで開く。
      dispatch({
        type: "OPEN_IN_NEW_TAB",
        page: { ...parsed, title: entry.title },
        background: true,
      });
    },
    [dispatch],
  );

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
          placeholder={
            searchMode === "body" ? "本文を検索..." : "タイトル・板を検索..."
          }
          prefix={
            <button
              type="button"
              className="search-bar__mode-toggle"
              onClick={() =>
                setSearchMode((prev) => (prev === "title" ? "body" : "title"))
              }
              title={
                searchMode === "body"
                  ? "本文検索中（クリックでタイトル検索へ）"
                  : "タイトル検索中（クリックで本文検索へ）"
              }
            >
              {searchMode === "body" ? "本文" : "タイトル"}
            </button>
          }
        />
      ) : null}
      {error ? <div className="thread-list-page__notice">{error}</div> : null}
      <div className="history-list-page__table">
        <VirtualizedDataTable
          columns={COLUMNS}
          rows={filtered}
          getRowKey={(row) => row.url}
          getRowTooltip={(row) => row.title}
          onRowClick={openEntry}
          onRowMiddleClick={openEntryInNewTab}
          sortColumn={sortState.column ?? undefined}
          sortDirection={sortState.direction}
          onSort={handleSort}
          estimatedRowHeight={52}
          columnVisibilityStorageKey={COLUMN_VISIBILITY_STORAGE_KEY}
          columnVisibilityLockedKeys={COLUMN_VISIBILITY_LOCKED_KEYS}
        />
      </div>
    </div>
  );
};
