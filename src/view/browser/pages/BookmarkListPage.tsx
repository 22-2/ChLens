import React, { useCallback, useEffect, useMemo, useState } from "react";
import { container } from "src/service-container/index";
import { SearchBar } from "src/view/browser/components/SearchBar";
import {
  ColumnDef,
  SimpleDataTable,
} from "src/view/browser/components/SimpleDataTable";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import {
  getLegacyBookmarkService,
  waitForLegacyBookmarkReady,
} from "src/view/browser/utils/legacy-app";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";

type SortDirection = "asc" | "desc";
type SortColumn =
  | "title"
  | "boardTitle"
  | "resCount"
  | "unreadCount"
  | "heat"
  | "createdAt";

type BookmarkSortState = {
  column: SortColumn | null;
  direction: SortDirection;
};

const DEFAULT_SORT_STATE: BookmarkSortState = {
  column: null,
  direction: "asc",
};

interface BookmarkEntry {
  url: string;
  title: string;
  pageType: "thread" | "threadList";
  boardTitle: string;
  resCount: number;
  unreadCount: number;
  heat: number;
  createdAt: number;
  originalIndex: number;
}

interface LegacyReadStateLike {
  read?: unknown;
}

interface LegacyBookmarkLike {
  url?: unknown;
  title?: unknown;
  boardTitle?: unknown;
  resCount?: unknown;
  readState?: LegacyReadStateLike | undefined;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseCreatedAt(url: string): number {
  const matched = url.match(/\/(\d+)\/?$/);
  if (!matched) {
    return 0;
  }
  return Number.parseInt(matched[1], 10) * 1000;
}

function calcHeat(createdAt: number, resCount: number): number {
  if (!createdAt || createdAt > Date.now()) {
    return 0;
  }
  const elapsedDays = Math.max((Date.now() - createdAt) / 86400000, 1 / 1440);
  return resCount / elapsedDays;
}

function deriveBoardTitle(threadUrl: string): string {
  try {
    const parsed = new window.URL(threadUrl);
    const match = parsed.pathname.match(/^\/test\/read\.cgi\/([^/]+)\//);
    if (match) {
      return `${parsed.hostname}/${match[1]}`;
    }
    return parsed.hostname;
  } catch {
    return "";
  }
}

function deriveBoardTitleFromBoardUrl(boardUrl: string): string {
  try {
    const parsed = new window.URL(boardUrl);
    const pathPart = parsed.pathname.replace(/^\/|\/$/g, "");
    return pathPart ? `${parsed.hostname}/${pathPart}` : parsed.hostname;
  } catch {
    return "";
  }
}

async function readBookmarks(): Promise<BookmarkEntry[]> {
  await waitForLegacyBookmarkReady();

  const bookmarkService = getLegacyBookmarkService();

  const rawItems =
    bookmarkService?.getAll?.() ??
    [
      ...(Array.isArray(bookmarkService?.getAllThreads?.())
        ? (bookmarkService?.getAllThreads?.() as unknown[])
        : []),
      ...(Array.isArray(bookmarkService?.getAllBoards?.())
        ? (bookmarkService?.getAllBoards?.() as unknown[])
        : []),
    ];
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .map((rawItem, index) => {
      const item = rawItem as LegacyBookmarkLike;
      const url = normalizeString(item.url);
      if (!url) {
        return null;
      }

      const parsed = parseInternalBrowserPage(url);
      if (!parsed) {
        return null;
      }

      const title = normalizeString(item.title, url);
      const resCount = Math.max(0, Math.trunc(toNumber(item.resCount)));
      const readCount = Math.max(0, Math.trunc(toNumber(item.readState?.read)));
      const isThreadBookmark = parsed.type === "thread";
      const unreadCount = isThreadBookmark ? Math.max(0, resCount - readCount) : 0;
      const createdAt = isThreadBookmark ? parseCreatedAt(url) : 0;

      return {
        url,
        title,
        pageType: parsed.type,
        boardTitle:
          parsed.type === "threadList"
            ? normalizeString(item.boardTitle, deriveBoardTitleFromBoardUrl(url))
            : normalizeString(item.boardTitle, deriveBoardTitle(url)),
        resCount,
        unreadCount,
        heat: isThreadBookmark ? calcHeat(createdAt, resCount) : 0,
        createdAt,
        originalIndex: index,
      } satisfies BookmarkEntry;
    })
    .filter((item): item is BookmarkEntry => item !== null);
}

const COLUMNS: ColumnDef<BookmarkEntry>[] = [
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
    cell: (row) => row.boardTitle,
  },
  {
    key: "resCount",
    header: "レス",
    headerClassName: "simple-data-table__th--count",
    cellClassName: "simple-data-table__count",
    sortable: true,
    cell: (row) => (row.pageType === "thread" ? row.resCount : "-"),
  },
  {
    key: "unreadCount",
    header: "未読",
    headerClassName: "simple-data-table__th--count",
    cellClassName: "simple-data-table__count",
    sortable: true,
    cell: (row) => (row.pageType === "thread" ? row.unreadCount : "-"),
  },
  {
    key: "heat",
    header: "勢い",
    headerClassName: "simple-data-table__th--heat",
    cellClassName: "simple-data-table__heat",
    sortable: true,
    cell: (row) => (row.pageType === "thread" ? row.heat.toFixed(1) : "-"),
  },
  {
    key: "createdAt",
    header: "作成日時",
    cellClassName: "simple-data-table__count",
    sortable: true,
    cell: (row) =>
      row.pageType === "thread" && row.createdAt
        ? new Date(row.createdAt).toLocaleString("ja-JP", {
            hour12: false,
          })
        : "-",
  },
];

interface BookmarkListPageProps {
  tabId: string;
}

export const BookmarkListPage: React.FC<BookmarkListPageProps> = ({ tabId }) => {
  const { dispatch, state, currentPage } = useTabStore();
  const [entries, setEntries] = useState<BookmarkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortState, setSortState] =
    useState<BookmarkSortState>(DEFAULT_SORT_STATE);

  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    pageType: "bookmarkList",
    tabId,
    isActive: state.activeTabId === tabId && currentPage.type === "bookmarkList",
    searchQuery,
    setSearchQuery,
  });

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await readBookmarks());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "ブックマークの読み込みに失敗しました",
      );
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    const handleBookmarkUpdated = () => {
      // 変更理由: ブックマーク一覧タブは hidden のまま保持されるため、
      // 追加・削除イベントで再読込しないと開き直しても古い一覧が残る。
      void loadEntries();
    };

    container.message.on("bookmark_updated", handleBookmarkUpdated);

    return () => {
      container.message.off("bookmark_updated", handleBookmarkUpdated);
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
        case "resCount":
          result = a.resCount - b.resCount;
          break;
        case "unreadCount":
          result = a.unreadCount - b.unreadCount;
          break;
        case "heat":
          result = a.heat - b.heat;
          break;
        case "createdAt":
          result = a.createdAt - b.createdAt;
          break;
      }

      return sortState.direction === "asc" ? result : -result;
    });

    return sorted;
  }, [entries, searchQuery, sortState]);

  const openEntry = useCallback(
    (entry: BookmarkEntry) => {
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
    (entry: BookmarkEntry) => {
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
        getRowKey={(row) => row.url}
        onRowClick={openEntry}
        onRowMiddleClick={openEntryInNewTab}
        sortColumn={sortState.column ?? undefined}
        sortDirection={sortState.direction}
        onSort={handleSort}
      />
    </div>
  );
};
