import { Clipboard, ExternalLink, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { container } from "src/service-container/index";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { ColumnDef, SimpleDataTable } from "src/view/browser/components/SimpleDataTable";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import { useTabDispatch, useTabViewState } from "src/view/browser/hooks/use-tab-store";
import type { Page } from "src/view/browser/types";
import { ContextMenu, type ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { Spinner } from "src/view/browser/ui/Spinner";
import {
  getLegacyBookmarkService,
  waitForLegacyBookmarkReady,
} from "src/view/browser/utils/legacy-app";
import {
  getBoardUrlFromThreadUrl,
  parseInternalBrowserPage,
} from "src/view/browser/utils/link-routing";
import { copyText, formatMarkdownLink } from "src/view/browser/utils/clipboard";

type SortDirection = "asc" | "desc";
type SortColumn = "title" | "boardTitle" | "resCount" | "unreadCount" | "heat" | "createdAt";

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

interface BookmarkContextMenuState {
  entry: BookmarkEntry;
  x: number;
  y: number;
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
    // 変更理由: read.cgi 系URLの板抽出を link-routing 側へ寄せ、UIごとの判定ブレを防ぐ。
    const boardUrl = getBoardUrlFromThreadUrl(threadUrl);
    if (boardUrl !== threadUrl) {
      const boardParsed = new window.URL(boardUrl);
      if (/^\/[^/]+\/$/.test(boardParsed.pathname)) {
        return `${parsed.hostname}/${boardParsed.pathname.replace(/^\//, "").replace(/\/$/, "")}`;
      }
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

  const allThreads = bookmarkService?.getAllThreads?.();
  const allBoards = bookmarkService?.getAllBoards?.();
  const rawItems = bookmarkService?.getAll?.() ?? [
    ...(Array.isArray(allThreads) ? (allThreads as unknown[]) : []),
    ...(Array.isArray(allBoards) ? (allBoards as unknown[]) : []),
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

function buildBookmarkPage(entry: BookmarkEntry): Page | null {
  const parsed = parseInternalBrowserPage(entry.url);
  if (!parsed) {
    return null;
  }

  // 変更理由: 行クリックとコンテキストメニューでページ構築を分けると、板名の補正がずれるため変換を共有する。
  return {
    ...parsed,
    title: entry.title,
    ...(parsed.type === "threadList" ? { boardTitle: entry.boardTitle || entry.title } : {}),
  };
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

const COLUMN_VISIBILITY_STORAGE_KEY = "chlens_browser_bookmark_list_columns_visibility";
const COLUMN_VISIBILITY_LOCKED_KEYS = ["title"] as const;

interface BookmarkListPageProps {
  tabId: string;
  isActive: boolean;
}

export const BookmarkListPage: React.FC<BookmarkListPageProps> = ({ tabId, isActive }) => {
  // タブ切り替えなど他タブ操作のたびにフル状態を再購読して再レンダリングされないよう、
  // dispatch のみ取得する安定したフックを使う。isActive は親から props で受け取る。
  const dispatch = useTabDispatch();
  const { state: persistedViewState, update: updateViewState } = useTabViewState(tabId, {
    type: "bookmarkList",
    title: "ブックマーク",
  });
  const [entries, setEntries] = useState<BookmarkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => persistedViewState.searchQuery ?? "");
  const [sortState, setSortState] = useState<BookmarkSortState>(() => {
    const column = persistedViewState.sortColumn;
    return {
      column:
        typeof column === "string" && COLUMNS.some((candidate) => candidate.key === column)
          ? (column as SortColumn)
          : null,
      direction: persistedViewState.sortDirection === "desc" ? "desc" : "asc",
    };
  });
  const [contextMenuState, setContextMenuState] = useState<BookmarkContextMenuState | null>(null);

  useEffect(() => {
    updateViewState({
      searchQuery,
      sortColumn: sortState.column,
      sortDirection: sortState.direction,
    });
  }, [searchQuery, sortState, updateViewState]);

  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    pageType: "bookmarkList",
    tabId,
    isActive,
    searchQuery,
    setSearchQuery,
  });

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await readBookmarks());
    } catch (e) {
      setError(e instanceof Error ? e.message : "ブックマークの読み込みに失敗しました");
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
      const page = buildBookmarkPage(entry);
      if (!page) return;

      dispatch({ type: "NAVIGATE", page });
    },
    [dispatch],
  );

  const openEntryInNewTab = useCallback(
    (entry: BookmarkEntry, background = true) => {
      const page = buildBookmarkPage(entry);
      if (!page) return;

      // ミドルクリックはバックグラウンドで開き、コンテキストメニューは通常の新規タブ設定に従う。
      dispatch({
        type: "OPEN_IN_NEW_TAB",
        page,
        ...(background ? { background: true } : {}),
      });
    },
    [dispatch],
  );

  const removeBookmark = useCallback(async (entry: BookmarkEntry) => {
    try {
      // 変更理由: Adapter の型は同期実装も許容する一方、レガシー実装は Promise を返すため、どちらの失敗も捕捉できる形にする。
      await Promise.resolve(container.bookmark.remove(entry.url));
      // 変更理由: bookmark_updated の配送を待たず、操作した行を即時に一覧から除去して stale 表示を防ぐ。
      setEntries((current) => current.filter((candidate) => candidate.url !== entry.url));
    } catch (error) {
      console.error("[BookmarkListPage] ブックマークの削除に失敗しました", {
        url: entry.url,
        error,
      });
    }
  }, []);

  const copyBookmarkText = useCallback(async (text: string, label: string) => {
    try {
      await copyText(text);
    } catch (error) {
      console.error(`[BookmarkListPage] ${label}のコピーに失敗しました`, error);
    }
  }, []);

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenuState) {
      return [];
    }

    const { entry } = contextMenuState;
    return [
      {
        id: "open-current",
        label: "現在のタブで開く",
        icon: <ExternalLink />,
        onSelect: () => openEntry(entry),
      },
      {
        id: "open-new-tab",
        label: "新しいタブで開く",
        icon: <ExternalLink />,
        onSelect: () => openEntryInNewTab(entry, false),
      },
      { id: "separator-bookmark", separator: true },
      {
        id: "remove-bookmark",
        label: "ブックマークを削除",
        icon: <Trash2 />,
        danger: true,
        onSelect: () => void removeBookmark(entry),
      },
      { id: "separator-copy", separator: true },
      {
        id: "copy-title",
        label: "タイトルをコピー",
        icon: <Clipboard />,
        onSelect: () => void copyBookmarkText(entry.title, "タイトル"),
      },
      {
        id: "copy-url",
        label: "URLをコピー",
        onSelect: () => void copyBookmarkText(entry.url, "URL"),
      },
      {
        id: "copy-title-url",
        label: "タイトル&URLをコピー",
        icon: <Clipboard />,
        onSelect: () => void copyBookmarkText(`${entry.title}\n${entry.url}`, "タイトルとURL"),
      },
      {
        id: "copy-title-url-markdown",
        label: "タイトル&URLをMarkdownでコピー",
        onSelect: () =>
          void copyBookmarkText(formatMarkdownLink(entry.title, entry.url), "タイトルとURL"),
      },
    ];
  }, [contextMenuState, copyBookmarkText, openEntry, openEntryInNewTab, removeBookmark]);

  if (loading) {
    return (
      <div className="page-status">
        <Spinner size="sm" aria-label="ブックマークを読み込み中" />
        <span>読み込み中...</span>
      </div>
    );
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
        getRowTooltip={(row) => row.title}
        onRowClick={openEntry}
        onRowMiddleClick={openEntryInNewTab}
        onRowContextMenu={(entry, x, y) => setContextMenuState({ entry, x, y })}
        sortColumn={sortState.column ?? undefined}
        sortDirection={sortState.direction}
        onSort={handleSort}
        columnVisibilityStorageKey={COLUMN_VISIBILITY_STORAGE_KEY}
        columnVisibilityLockedKeys={COLUMN_VISIBILITY_LOCKED_KEYS}
      />
      {contextMenuState ? (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          items={contextMenuItems}
          onClose={() => setContextMenuState(null)}
        />
      ) : null}
    </div>
  );
};
