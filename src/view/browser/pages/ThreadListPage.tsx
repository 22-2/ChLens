import { Bookmark, BookmarkX } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ask as askBoardTitle } from "src/core/BoardTitleSolver.js";
import { URL as ChURL } from "src/core/URL";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import {
  ContextMenu,
  ContextMenuItem,
} from "src/view/browser/components/ContextMenu";
import { SearchBar } from "src/view/browser/components/SearchBar";
import {
  ColumnDef,
  SimpleDataTable,
} from "src/view/browser/components/SimpleDataTable";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import type { ThreadListPage as ThreadListPageType } from "src/view/browser/types";
import { copyText } from "src/view/browser/utils/utils";

interface Props {
  tabId: string;
  page: ThreadListPageType;
  refreshKey: number;
}

type SortColumn = "num" | "title" | "resCount" | "heat";
type SortDirection = "asc" | "desc";
type ThreadListSortPreference = {
  column: SortColumn;
  direction: SortDirection;
};

const THREAD_LIST_SORT_STORAGE_KEY = "readcrx_browser_thread_list_sort_by_site";
const DEFAULT_THREAD_LIST_SORT: ThreadListSortPreference = {
  column: "num",
  direction: "asc",
};

const BG_COLOR_PRESETS: Record<string, string> = {
  yellow: "#ffeb3b",
  blue: "#e3f2fd",
  green: "#c8e6c9",
  red: "#ffcdd2",
  purple: "#e1bee7",
  orange: "#ffe0b2",
  pink: "#f8bbd0",
  cyan: "#b2ebf2",
  lime: "#f0f4c3",
  amber: "#ffecb3",
};

function isSortColumn(value: string): value is SortColumn {
  return (
    value === "num" ||
    value === "title" ||
    value === "resCount" ||
    value === "heat"
  );
}

function isSortDirection(value: string): value is SortDirection {
  return value === "asc" || value === "desc";
}

function resolveThreadListSortSiteKey(boardUrl: string): string {
  try {
    const normalizedUrl = new ChURL(boardUrl);
    const tsld = normalizedUrl.getTsld();
    if (tsld) {
      return tsld;
    }
  } catch {
    // URL 正規化に失敗しても hostname fallback で復元可能なら sort 設定を維持する。
  }

  try {
    return new window.URL(boardUrl).hostname.toLowerCase();
  } catch {
    return boardUrl;
  }
}

function readThreadListSortPreference(
  boardUrl: string,
): ThreadListSortPreference {
  try {
    const raw = window.localStorage.getItem(THREAD_LIST_SORT_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_THREAD_LIST_SORT;
    }

    const stored = JSON.parse(raw) as Record<
      string,
      Partial<ThreadListSortPreference> | undefined
    >;
    const currentSitePreference =
      stored[resolveThreadListSortSiteKey(boardUrl)];
    const column = currentSitePreference?.column;
    const direction = currentSitePreference?.direction;
    if (
      column &&
      direction &&
      isSortColumn(column) &&
      isSortDirection(direction)
    ) {
      return {
        column,
        direction,
      };
    }
  } catch {
    // 保存値が壊れていても一覧表示自体は継続できるよう default へ戻す。
  }

  return DEFAULT_THREAD_LIST_SORT;
}

function writeThreadListSortPreference(
  boardUrl: string,
  preference: ThreadListSortPreference,
): void {
  try {
    const raw = window.localStorage.getItem(THREAD_LIST_SORT_STORAGE_KEY);
    const stored = raw
      ? (JSON.parse(raw) as Record<string, ThreadListSortPreference>)
      : {};

    stored[resolveThreadListSortSiteKey(boardUrl)] = preference;
    window.localStorage.setItem(
      THREAD_LIST_SORT_STORAGE_KEY,
      JSON.stringify(stored),
    );
  } catch {
    // localStorage 書き込み不可でも一覧操作は止めない。
  }
}

function calcHeat(now: number, created: number, resCount: number): string {
  if (!Number.isFinite(created) || created > now) return "0.0";
  const elapsed = Math.max((now - created) / 1000, 1) / (24 * 60 * 60);
  return (resCount / elapsed).toFixed(1);
}

type DisplayThread = {
  thread: IThread;
  originalIndex: number;
  heat: number;
};

const THREAD_LIST_COLUMNS: ColumnDef<DisplayThread>[] = [
  {
    key: "num",
    header: "No.",
    headerClassName: "thread-list__th--num",
    cellClassName: "thread-list__num",
    sortable: true,
    cell: ({ originalIndex }) => originalIndex,
  },
  {
    key: "title",
    header: "タイトル",
    headerClassName: "thread-list__th--title",
    cellClassName: "thread-list__title",
    sortable: true,
    cell: ({ thread }) => {
      const hlParams = thread.highlight?.params;
      return (
        <>
          {thread.title}
          {hlParams?.label && (
            <span className="thread-list__label">{hlParams.label}</span>
          )}
        </>
      );
    },
  },
  {
    key: "resCount",
    header: "レス",
    headerClassName: "thread-list__th--count",
    cellClassName: "thread-list__count",
    sortable: true,
    cell: ({ thread }) => thread.resCount,
  },
  {
    key: "heat",
    header: "勢い",
    headerClassName: "thread-list__th--heat",
    cellClassName: "thread-list__heat",
    sortable: true,
    cell: ({ heat }) => heat.toFixed(1),
  },
];

export const ThreadListPage: React.FC<Props> = ({
  tabId,
  page,
  refreshKey,
}) => {
  const { dispatch } = useTabStore();
  const titleFetched = useRef(false);
  const [threads, setThreads] = useState<IThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortPreference, setSortPreference] =
    useState<ThreadListSortPreference>(() =>
      readThreadListSortPreference(page.boardUrl),
    );
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
    thread: IThread;
  } | null>(null);
  const { column: sortColumn, direction: sortDirection } = sortPreference;

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // container経由でBoardサービスにアクセス
      const result = await container.board.getThreads(page.boardUrl);
      setThreads(result.threads);
      if (result.message) {
        setError(result.message);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "スレッド一覧の取得に失敗しました",
      );
    } finally {
      setLoading(false);
    }
    // refreshKeyが変わったとき（更新ボタン押下）に再取得を走らせる
  }, [page.boardUrl, refreshKey]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    // 板ごとではなく site 単位で揃えると、同一サイト内を移動しても header sort が毎回初期化されない。
    setSortPreference(readThreadListSortPreference(page.boardUrl));
  }, [page.boardUrl]);

  useEffect(() => {
    writeThreadListSortPreference(page.boardUrl, sortPreference);
  }, [page.boardUrl, sortPreference]);

  useEffect(() => {
    if (titleFetched.current) return;
    titleFetched.current = true;
    // boardTitleがURLと同じ場合（アドレスバー入力など）はBoardTitleSolverで解決する
    if (page.boardTitle && page.boardTitle !== page.boardUrl) {
      dispatch({ type: "UPDATE_TITLE_FOR_TAB", tabId, title: page.boardTitle });
      return;
    }
    askBoardTitle(new ChURL(page.boardUrl))
      .then((title) => {
        if (title) {
          dispatch({ type: "UPDATE_TITLE_FOR_TAB", tabId, title });
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }, [dispatch, page.boardTitle, page.boardUrl, tabId]);

  // Ctrl+Fで検索バーを開く
  // useEffect(() => {
  //   const handleKeyDown = (e: KeyboardEvent) => {
  //     if (e.ctrlKey && e.key === "f") {
  //       e.preventDefault();
  //       setShowSearch(true);
  //     }
  //   };
  //   window.addEventListener("keydown", handleKeyDown);
  //   return () => window.removeEventListener("keydown", handleKeyDown);
  // }, []);

  const handleSort = useCallback((column: SortColumn) => {
    setSortPreference((prev) => {
      if (prev.column === column) {
        // 同じカラムクリック時は方向を反転
        return {
          column,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return {
        column,
        direction: "asc",
      };
    });
  }, []);

  // ソート・検索フィルタ適用後のスレッド一覧
  const displayThreads = useMemo(() => {
    const now = Date.now();
    let list = threads.map((t, i) => ({
      thread: t,
      originalIndex: i + 1,
      heat: parseFloat(calcHeat(now, t.createdAt, t.resCount)),
    }));

    // テキスト検索フィルタ
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(({ thread }) =>
        thread.title.toLowerCase().includes(q),
      );
    }

    // ソート
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "num":
          cmp = a.originalIndex - b.originalIndex;
          break;
        case "title":
          cmp = a.thread.title.localeCompare(b.thread.title, "ja");
          break;
        case "resCount":
          cmp = a.thread.resCount - b.thread.resCount;
          break;
        case "heat":
          cmp = a.heat - b.heat;
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    // 既存動作に合わせ、ハイライトスレッドを常に先頭に表示
    const highlighted = list.filter(({ thread }) => thread.highlight);
    const normal = list.filter(({ thread }) => !thread.highlight);
    return [...highlighted, ...normal];
  }, [threads, sortColumn, sortDirection, searchQuery]);

  const handleThreadClick = useCallback(
    ({ thread }: DisplayThread) => {
      dispatch({
        type: "NAVIGATE",
        page: { type: "thread", title: thread.title, threadUrl: thread.url },
      });
    },
    [dispatch],
  );

  const openThreadInNewTab = useCallback(
    ({ thread }: DisplayThread) => {
      // ミドルクリックはバックグラウンドで開く（アクティブタブを切り替えない）
      dispatch({
        type: "OPEN_IN_NEW_TAB",
        page: { type: "thread", title: thread.title, threadUrl: thread.url },
      });
    },
    [dispatch],
  );

  const handleTableSort = useCallback(
    (key: string) => {
      if (isSortColumn(key)) handleSort(key);
    },
    [handleSort],
  );

  const contextMenuItems = useMemo(() => {
    if (!contextMenuState) return [];
    const { thread } = contextMenuState;
    const isBookmarked = container.bookmark?.get(thread.url);
    const items: ContextMenuItem[] = [
      {
        id: "bookmark",
        label: isBookmarked ? "ブックマークを削除" : "ブックマークに追加",
        icon: isBookmarked ? <BookmarkX /> : <Bookmark />,
        onSelect: () => {
          try {
            if (isBookmarked) {
              void container.bookmark.remove(thread.url);
            } else {
              void container.bookmark.add({
                url: thread.url,
                title: thread.title,
                type: "thread",
              });
            }
          } catch {
            // noop
          }
        },
      },
      {
        id: "copy-title",
        label: "スレタイをコピー",
        onSelect: () => void copyText(thread.title),
      },
      {
        id: "copy-url",
        label: "URLをコピー",
        onSelect: () => void copyText(thread.url),
      },
      {
        id: "copy-title-url",
        label: "スレタイ&URLをコピー",
        onSelect: () => void copyText(`${thread.title}\n${thread.url}`),
      },
    ];
    return items;
  }, [contextMenuState]);

  // threads が既にある場合（更新中）はチラつき防止のため loading 表示をスキップする
  if (loading && threads.length === 0) {
    return <div className="page-status">読み込み中...</div>;
  }

  if (error && threads.length === 0) {
    return (
      <div className="page-status page-status--error">
        <p>{error}</p>
        <button className="page-status__retry" onClick={fetchThreads}>
          再試行
        </button>
      </div>
    );
  }

  return (
    <div className="thread-list-page">
      {showSearch && (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={() => {
            setShowSearch(false);
            setSearchQuery("");
          }}
          hitCount={displayThreads.length}
        />
      )}
      {error && <div className="thread-list-page__notice">{error}</div>}
      <SimpleDataTable
        columns={THREAD_LIST_COLUMNS}
        rows={displayThreads}
        getRowKey={({ thread }) => thread.url}
        getRowClassName={({ thread }) => {
          const classes: string[] = [];
          if (thread.ng) classes.push("thread-list__row--ng");
          if (thread.highlight) classes.push("thread-list__row--highlight");
          return classes.join(" ") || undefined;
        }}
        getRowStyle={({ thread }) => {
          const bgColor = thread.highlight?.params?.bgColor;
          if (!bgColor) return {};
          return { backgroundColor: BG_COLOR_PRESETS[bgColor] ?? bgColor };
        }}
        onRowClick={handleThreadClick}
        onRowMiddleClick={openThreadInNewTab}
        onRowContextMenu={({ thread }, x, y) =>
          setContextMenuState({ x, y, thread })
        }
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleTableSort}
      />
      {contextMenuState && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          items={contextMenuItems}
          onClose={() => setContextMenuState(null)}
        />
      )}
    </div>
  );
};
