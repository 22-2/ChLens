import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SearchBar } from "src/view/browser/components/SearchBar";
import {
  ColumnDef,
  SimpleDataTable,
} from "src/view/browser/components/SimpleDataTable";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";

import {
  formatCompactDateTime,
  normalizeLegacyTimestamp,
} from "src/view/browser/utils/date-time";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";

type SortDirection = "asc" | "desc";
type SortColumn =
  | "title"
  | "writtenRes"
  | "name"
  | "mail"
  | "message"
  | "writtenDate";

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

async function readWriteHistoryEntries(): Promise<WriteHistoryEntry[]> {
  const writeHistoryService = window.app?.WriteHistory as
    | {
        get?: (offset?: number, count?: number) => Promise<unknown> | unknown;
      }
    | undefined;

  if (!writeHistoryService?.get) {
    return [];
  }

  const raw = await writeHistoryService.get(undefined, 5000);
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((value, index) => {
      const item = value as LegacyWriteHistoryLike;
      const url = normalizeString(item.url);
      if (!url) {
        return null;
      }

      // 変更理由: 旧UIの書込履歴は `date` フィールドで残っている場合があるため、
      // new-ui でも両形式を受けて日時列を欠損させない。
      const parsedDate = normalizeLegacyTimestamp(
        item.writtenDate ?? item.date,
      );

      return {
        url,
        title: normalizeString(item.title, url),
        writtenRes: Math.max(
          0,
          Math.trunc(normalizeNumber(item.writtenRes ?? item.res)),
        ),
        name: normalizeString(item.name),
        mail: normalizeString(item.mail),
        message: normalizeString(item.message),
        writtenDate: parsedDate,
        originalIndex: index,
      } satisfies WriteHistoryEntry;
    })
    .filter((item): item is WriteHistoryEntry => item !== null);
}

const COLUMNS: ColumnDef<WriteHistoryEntry>[] = [
  {
    key: "title",
    header: "タイトル",
    headerClassName: "simple-data-table__th--title",
    cellClassName: "simple-data-table__title",
    sortable: true,
    cell: (row) => row.title,
  },
  {
    key: "writtenRes",
    header: "レス",
    headerClassName: "simple-data-table__th--writehistory-res",
    cellClassName: "simple-data-table__writehistory-res",
    sortable: true,
    cell: (row) => row.writtenRes,
  },
  {
    key: "name",
    header: "名前",
    headerClassName: "simple-data-table__th--writehistory-name",
    cellClassName: "simple-data-table__writehistory-name",
    sortable: true,
    cell: (row) => row.name || "-",
  },
  {
    key: "mail",
    header: "メール",
    headerClassName: "simple-data-table__th--writehistory-mail",
    cellClassName: "simple-data-table__writehistory-mail",
    sortable: true,
    cell: (row) => row.mail || "-",
  },
  {
    key: "message",
    header: "本文",
    cellClassName: "simple-data-table__writehistory-message",
    sortable: true,
    cell: (row) => row.message || "-",
  },
  {
    key: "writtenDate",
    header: "書込日時",
    headerClassName: "simple-data-table__th--writehistory-date",
    cellClassName: "simple-data-table__writehistory-date",
    sortable: true,
    cell: (row) =>
      row.writtenDate ? formatCompactDateTime(row.writtenDate) : "-",
  },
];

interface WriteHistoryListPageProps {
  tabId: string;
}

export const WriteHistoryListPage: React.FC<WriteHistoryListPageProps> = ({
  tabId,
}) => {
  const { dispatch, state, currentPage } = useTabStore();
  const [entries, setEntries] = useState<WriteHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);

  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    pageType: "writeHistoryList",
    tabId,
    isActive:
      state.activeTabId === tabId && currentPage.type === "writeHistoryList",
    searchQuery,
    setSearchQuery,
  });

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await readWriteHistoryEntries();
      setEntries(rows);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "書き込み履歴の読み込みに失敗しました",
      );
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
          `${entry.title} ${entry.name} ${entry.mail} ${entry.message}`
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
      const parsed = parseInternalBrowserPage(entry.url);
      if (!parsed) return;

      dispatch({
        type: "NAVIGATE",
        page: {
          ...parsed,
          title: entry.title,
        },
      });
    },
    [dispatch],
  );

  const openEntryInNewTab = useCallback(
    (entry: WriteHistoryEntry) => {
      const parsed = parseInternalBrowserPage(entry.url);
      if (!parsed) return;

      dispatch({
        type: "OPEN_IN_NEW_TAB",
        page: {
          ...parsed,
          title: entry.title,
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
    <div className="thread-list-page">
      {isFilterOpen ? (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={closeFilterToolbar}
          hitCount={filtered.length}
        />
      ) : null}
      <SimpleDataTable
        columns={COLUMNS}
        rows={filtered}
        getRowKey={(row) => `${row.url}:${row.originalIndex}`}
        onRowClick={openEntry}
        onRowMiddleClick={openEntryInNewTab}
        sortColumn={sortState.column ?? undefined}
        sortDirection={sortState.direction}
        onSort={handleSort}
      />
    </div>
  );
};
