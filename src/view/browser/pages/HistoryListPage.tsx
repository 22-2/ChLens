import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SearchBar } from "src/view/browser/components/SearchBar";
import {
  ColumnDef,
  SimpleDataTable,
} from "src/view/browser/components/SimpleDataTable";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

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
  originalIndex: number;
}

interface LegacyHistoryLike {
  url?: unknown;
  title?: unknown;
  boardTitle?: unknown;
  viewedDate?: unknown;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeDate(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

async function readHistoryEntries(): Promise<HistoryEntry[]> {
  const historyService = window.app?.History as
    | {
        getUnique?: (
          offset?: number,
          count?: number,
        ) => Promise<unknown> | unknown;
      }
    | undefined;

  if (!historyService?.getUnique) {
    return [];
  }

  const raw = await historyService.getUnique(undefined, 5000);
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((value, index) => {
      const item = value as LegacyHistoryLike;
      const url = normalizeString(item.url);
      if (!url) {
        return null;
      }

      return {
        url,
        title: normalizeString(item.title, url),
        boardTitle: normalizeString(item.boardTitle),
        viewedDate: normalizeDate(item.viewedDate),
        originalIndex: index,
      } satisfies HistoryEntry;
    })
    .filter((item): item is HistoryEntry => item !== null);
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
    cellClassName: "simple-data-table__count",
    sortable: true,
    cell: (row) => row.boardTitle || "-",
  },
  {
    key: "viewedDate",
    header: "閲覧日時",
    cellClassName: "simple-data-table__count",
    sortable: true,
    cell: (row) =>
      row.viewedDate
        ? new Date(row.viewedDate).toLocaleString("ja-JP", {
            hour12: false,
          })
        : "-",
  },
];

export const HistoryListPage: React.FC = () => {
  const { dispatch } = useTabStore();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await readHistoryEntries();
      setEntries(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "閲覧履歴の読み込みに失敗しました");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
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
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const rows = normalizedQuery
      ? entries.filter((entry) =>
          `${entry.title} ${entry.boardTitle}`.toLowerCase().includes(normalizedQuery),
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

  const openThread = useCallback(
    (entry: HistoryEntry) => {
      dispatch({
        type: "NAVIGATE",
        page: {
          type: "thread",
          title: entry.title,
          threadUrl: entry.url,
        },
      });
    },
    [dispatch],
  );

  const openThreadInNewTab = useCallback(
    (entry: HistoryEntry) => {
      dispatch({
        type: "OPEN_IN_NEW_TAB",
        page: {
          type: "thread",
          title: entry.title,
          threadUrl: entry.url,
        },
      });
    },
    [dispatch],
  );

  if (loading) {
    return <div className="page-status">読み込み中...</div>;
  }

  if (error) {
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
    <div className="thread-list-page">
      <SearchBar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onClose={() => setSearchQuery("")}
        hitCount={filtered.length}
      />
      <SimpleDataTable
        columns={COLUMNS}
        rows={filtered}
        getRowKey={(row) => `${row.url}:${row.originalIndex}`}
        onRowClick={openThread}
        onRowMiddleClick={openThreadInNewTab}
        sortColumn={sortState.column ?? undefined}
        sortDirection={sortState.direction}
        onSort={handleSort}
      />
    </div>
  );
};
