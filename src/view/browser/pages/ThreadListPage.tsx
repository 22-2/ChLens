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
import { useNgStatus } from "src/view/browser/hooks/use-ng-status";
import { useTabDispatch } from "src/view/browser/hooks/use-tab-store";
import {
  useTheme,
  type ResolvedTheme,
} from "src/view/browser/hooks/use-theme";
import type { ThreadListPage as ThreadListPageType } from "src/view/browser/types";
import { copyText } from "src/view/browser/utils/utils";

const BOARD_AUTO_REFRESH_CONFIG_KEY = "auto_load_second_board";
const MIN_BOARD_AUTO_REFRESH_MS = 20000;

function readBoardAutoRefreshIntervalMs(): number {
  const rawValue = container.config.get(BOARD_AUTO_REFRESH_CONFIG_KEY);
  const parsedValue = Number.parseInt(rawValue ?? "0", 10);
  if (Number.isNaN(parsedValue)) {
    return 0;
  }
  return parsedValue;
}

interface Props {
  tabId: string;
  page: ThreadListPageType;
  refreshKey: number;
  isActive: boolean;
}

type SortColumn = "num" | "title" | "resCount" | "heat";
type SortDirection = "asc" | "desc";
type ThreadListSortPreference = {
  column: SortColumn | null;
  direction: SortDirection;
};

const THREAD_LIST_SORT_STORAGE_KEY = "readcrx_browser_thread_list_sort_by_site";
const DEFAULT_THREAD_LIST_SORT: ThreadListSortPreference = {
  column: null,
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

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type HighlightRowStyle = React.CSSProperties & {
  "--thread-list-highlight-bg"?: string;
  "--thread-list-highlight-hover-bg"?: string;
};

function parseColorToRgb(rawColor: string): Rgb | null {
  const color = rawColor.trim();
  const shortHex = color.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("").map((char) => `${char}${char}`);
    return {
      r: Number.parseInt(r, 16),
      g: Number.parseInt(g, 16),
      b: Number.parseInt(b, 16),
    };
  }

  const longHex = color.match(/^#([0-9a-f]{6})$/i);
  if (longHex) {
    return {
      r: Number.parseInt(longHex[1].slice(0, 2), 16),
      g: Number.parseInt(longHex[1].slice(2, 4), 16),
      b: Number.parseInt(longHex[1].slice(4, 6), 16),
    };
  }

  const rgb = color.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i,
  );
  if (rgb) {
    return {
      r: Number.parseInt(rgb[1], 10),
      g: Number.parseInt(rgb[2], 10),
      b: Number.parseInt(rgb[3], 10),
    };
  }

  return null;
}

function blendRgb(base: Rgb, overlay: Rgb, alpha: number): string {
  const blendChannel = (baseChannel: number, overlayChannel: number) =>
    Math.round(baseChannel * (1 - alpha) + overlayChannel * alpha);

  return `rgb(${blendChannel(base.r, overlay.r)}, ${blendChannel(
    base.g,
    overlay.g,
  )}, ${blendChannel(base.b, overlay.b)})`;
}

function resolveHighlightColor(bgColor: string): string {
  return BG_COLOR_PRESETS[bgColor] ?? bgColor;
}

function createHighlightRowStyle(
  bgColor: string,
  theme: ResolvedTheme,
): HighlightRowStyle {
  const resolvedBackground = resolveHighlightColor(bgColor);
  const parsed = parseColorToRgb(resolvedBackground);

  if (!parsed) {
    return {
      "--thread-list-highlight-bg": resolvedBackground,
    };
  }

  const overlay =
    theme === "dark"
      // hover時の差をもう少し明確にして、強調行だと一目で分かるようにする。
      ? { color: { r: 255, g: 255, b: 255 }, alpha: 0.3 }
      : { color: { r: 0, g: 0, b: 0 }, alpha: 0.16 };

  // inline background-color だと hover 時に上書きしづらいので、通常色と hover 色を CSS 変数で渡す。
  return {
    "--thread-list-highlight-bg": resolvedBackground,
    "--thread-list-highlight-hover-bg": blendRgb(
      parsed,
      overlay.color,
      overlay.alpha,
    ),
  };
}

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
    if (column === null) {
      return {
        column: null,
        direction: "asc",
      };
    }
    if (column && direction && isSortColumn(column) && isSortDirection(direction)) {
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
  isActive,
}) => {
  const dispatch = useTabDispatch();
  const { isNgTemporarilyDisabled, setThreadListStats } = useNgStatus();
  const theme = useTheme();
  const titleFetched = useRef(false);
  const [threads, setThreads] = useState<IThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boardAutoRefreshIntervalMs, setBoardAutoRefreshIntervalMs] = useState(
    readBoardAutoRefreshIntervalMs,
  );
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    document.visibilityState === "visible",
  );
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

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const applyInterval = () => {
      setBoardAutoRefreshIntervalMs(readBoardAutoRefreshIntervalMs());
    };

    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === BOARD_AUTO_REFRESH_CONFIG_KEY) {
        applyInterval();
      }
    };

    container.config.ready(applyInterval);
    container.message.on("config_updated", handleConfigUpdated);

    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  useEffect(() => {
    if (
      !isActive ||
      !isDocumentVisible ||
      boardAutoRefreshIntervalMs < MIN_BOARD_AUTO_REFRESH_MS
    ) {
      return;
    }

    const timerId = window.setInterval(() => {
      if (loading) {
        return;
      }

      // タブを切り替えた瞬間に旧タブの更新が走ると体感が悪いため、
      // 一覧の自動更新は表示中タブの RELOAD 経路だけを使って発火する。
      dispatch({ type: "RELOAD" });
    }, boardAutoRefreshIntervalMs);

    return () => {
      window.clearInterval(timerId);
    };
  }, [
    boardAutoRefreshIntervalMs,
    dispatch,
    isActive,
    isDocumentVisible,
    loading,
  ]);

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
      if (prev.column !== column) {
        return {
          column,
          direction: "asc",
        };
      }

      if (prev.direction === "asc") {
        return {
          column,
          direction: "desc",
        };
      }

      // 3状態ソート: 昇順 → 降順 → デフォルト(未ソート)
      return {
        column: null,
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

    // sortColumn が null の間は取得順を維持し、デフォルト状態へ戻せるようにする。
    if (sortColumn) {
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
    }

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

  const threadListNgCount = useMemo(
    () => threads.filter((thread) => thread.ng != null).length,
    [threads],
  );
  const threadListHighlightCount = useMemo(
    () => threads.filter((thread) => thread.highlight != null).length,
    [threads],
  );

  useEffect(() => {
    // 件数表示は検索/ソートの表示結果ではなく、取得済み一覧全体を基準にする。
    setThreadListStats({
      ngCount: threadListNgCount,
      highlightCount: threadListHighlightCount,
    });
    return () => {
      setThreadListStats({ ngCount: 0, highlightCount: 0 });
    };
  }, [setThreadListStats, threadListHighlightCount, threadListNgCount]);

  // 条件付きで早期返却するとhooksの呼び出し数が変わってReactエラーになるため、
  // JSXレベルで条件分岐をして、すべてのhooksをレンダーパスの上部で呼び出す
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
          if (thread.ng && !isNgTemporarilyDisabled) {
            classes.push("thread-list__row--ng");
          }
          if (thread.highlight) classes.push("thread-list__row--highlight");
          return classes.join(" ") || undefined;
        }}
        getRowStyle={({ thread }) => {
          const bgColor = thread.highlight?.params?.bgColor;
          if (!bgColor) return {};
          return createHighlightRowStyle(bgColor, theme);
        }}
        onRowClick={handleThreadClick}
        onRowMiddleClick={openThreadInNewTab}
        onRowContextMenu={({ thread }, x, y) =>
          setContextMenuState({ x, y, thread })
        }
        sortColumn={sortColumn ?? undefined}
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
