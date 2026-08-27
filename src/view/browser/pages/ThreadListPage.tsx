import { Bookmark, BookmarkX } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { platform } from "src/app";
import { getStore2String, setStore2String } from "src/app/Store2Storage";
import { ask as askBoardTitle } from "src/core/BoardTitleSolver.js";
import { stringifyNgDslValue } from "src/core/ngDsl";
import { URL as ChURL } from "src/core/URL";
import { container } from "src/service-container/index";
import type { IReadState, IThread } from "src/service-container/interfaces";
import { SearchBar } from "src/view/browser/components/SearchBar";
import {
  ColumnDef,
  SimpleDataTable,
  type DataTableSection,
} from "src/view/browser/components/SimpleDataTable";
import { WheelScrollIndicator } from "src/view/browser/components/WheelScrollIndicator";
import {
  BOARD_AUTO_REFRESH_CONFIG_KEY,
  MIN_BOARD_AUTO_REFRESH_MS,
  readBoardAutoRefreshIntervalMs,
} from "src/view/browser/hooks/auto-refresh-config";
import { useNgStatus } from "src/view/browser/hooks/use-ng-status";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import { useTabDispatch, useTabViewState } from "src/view/browser/hooks/use-tab-store";
import { useTheme, type ResolvedTheme } from "src/view/browser/hooks/use-theme";
import { useWheelPagination, WHEEL_THRESHOLD } from "src/view/browser/hooks/useWheelPagination";
import type { ThreadListPage as ThreadListPageType } from "src/view/browser/types";
import { ContextMenu, ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { Spinner } from "src/view/browser/ui/Spinner";
import { copyText } from "src/view/browser/utils/utils";
import { ThreadListView } from "src/view/shared/ThreadListView";
const OPENED_BOARDS_CONFIG_KEY = "opened_board_entries";
const MAX_OPENED_BOARD_ENTRIES = 500;

// 変更理由: タブ再マウント時やブラウザ再起動後に「読み込み中」しか表示されないのを防ぐため、
// 前回の取得結果をIDBに永続化し、新しいデータの取得中は古い結果を表示し続ける。
const UI_CACHE_STORE = "UICache";
const threadListCacheKey = (boardUrl: string) => `threadList:${boardUrl}`;

const getThreadListCache = async (boardUrl: string): Promise<IThread[] | null> => {
  try {
    const store = platform.storage.getStore(UI_CACHE_STORE);
    const entry = (await store.get(threadListCacheKey(boardUrl))) as
      | { url: string; data: IThread[] }
      | undefined;
    return entry?.data ?? null;
  } catch {
    return null;
  }
};

const setThreadListCache = async (boardUrl: string, threads: IThread[]): Promise<void> => {
  try {
    const store = platform.storage.getStore(UI_CACHE_STORE);
    await store.put({ url: threadListCacheKey(boardUrl), data: threads });
  } catch (error) {
    console.error("[ThreadListPage] cache save failed:", error);
  }
};

interface Props {
  tabId: string;
  page: ThreadListPageType;
  refreshKey: number;
  isActive: boolean;
  isAutoRefreshEnabled?: boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

type SortColumn = "num" | "title" | "resCount" | "unreadCount" | "heat";
type SortDirection = "asc" | "desc";
type ThreadListSortPreference = {
  column: SortColumn | null;
  direction: SortDirection;
};

const THREAD_LIST_SORT_STORAGE_KEY = "chlens_browser_thread_list_sort_by_site";
const THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY = "chlens_browser_thread_list_columns_visibility";
const THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS = ["title"] as const;
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

type DividerStyle = React.CSSProperties & {
  "--data-table-divider-accent"?: string;
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

function createHighlightRowStyle(bgColor: string, theme: ResolvedTheme): HighlightRowStyle {
  const resolvedBackground = resolveHighlightColor(bgColor);
  const parsed = parseColorToRgb(resolvedBackground);

  if (!parsed) {
    return {
      "--thread-list-highlight-bg": resolvedBackground,
    };
  }

  const overlay =
    theme === "dark"
      ? // hover時の差をもう少し明確にして、強調行だと一目で分かるようにする。
        { color: { r: 255, g: 255, b: 255 }, alpha: 0.3 }
      : { color: { r: 0, g: 0, b: 0 }, alpha: 0.16 };

  // inline background-color だと hover 時に上書きしづらいので、通常色と hover 色を CSS 変数で渡す。
  return {
    "--thread-list-highlight-bg": resolvedBackground,
    "--thread-list-highlight-hover-bg": blendRgb(parsed, overlay.color, overlay.alpha),
  };
}

function createHighlightDividerStyle(bgColor: string): DividerStyle {
  // 変更理由: セクション全体を任意色で塗るとテーマによって文字が読みにくくなるため、
  // ルール色はdivider下端のアクセントとしてだけ使用する。
  return { "--data-table-divider-accent": resolveHighlightColor(bgColor) };
}

function isSortColumn(value: string): value is SortColumn {
  return (
    value === "num" ||
    value === "title" ||
    value === "resCount" ||
    value === "unreadCount" ||
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

function readThreadListSortPreference(boardUrl: string): ThreadListSortPreference {
  try {
    const raw = getStore2String(THREAD_LIST_SORT_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_THREAD_LIST_SORT;
    }

    const stored = JSON.parse(raw) as Record<string, Partial<ThreadListSortPreference> | undefined>;
    const currentSitePreference = stored[resolveThreadListSortSiteKey(boardUrl)];
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
    const raw = getStore2String(THREAD_LIST_SORT_STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Record<string, ThreadListSortPreference>) : {};

    stored[resolveThreadListSortSiteKey(boardUrl)] = preference;
    void setStore2String(THREAD_LIST_SORT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // localStorage 書き込み不可でも一覧操作は止めない。
  }
}

function deriveBoardTitlePlaceholder(boardUrl: string): string | null {
  try {
    const parsed = new window.URL(boardUrl);
    const pathPart = parsed.pathname.replace(/^\/|\/$/g, "");
    return pathPart ? `${parsed.hostname}/${pathPart}` : parsed.hostname;
  } catch {
    return null;
  }
}

interface OpenedBoardEntry {
  url: string;
  title: string;
}

function normalizeBoardUrl(rawUrl: string): string {
  try {
    return new window.URL(rawUrl).href;
  } catch {
    return rawUrl;
  }
}

function readOpenedBoardEntries(): OpenedBoardEntry[] {
  const raw = container.config.get(OPENED_BOARDS_CONFIG_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<{ url?: unknown; title?: unknown }>;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry.url !== "string") {
          return null;
        }

        return {
          url: normalizeBoardUrl(entry.url),
          title: (entry.title as string) || "",
        } satisfies OpenedBoardEntry;
      })
      .filter((entry): entry is OpenedBoardEntry => entry !== null);
  } catch {
    // 破損データは空扱いで継続し、閲覧導線を止めない。
    return [];
  }
}

function writeOpenedBoardEntries(entries: OpenedBoardEntry[]): void {
  void container.config.set(
    OPENED_BOARDS_CONFIG_KEY,
    JSON.stringify(entries.slice(0, MAX_OPENED_BOARD_ENTRIES)),
  );
}

function upsertOpenedBoardEntry(boardUrl: string, boardTitle: string | null): void {
  const normalizedUrl = normalizeBoardUrl(boardUrl);
  const nextTitle = boardTitle && boardTitle.trim() !== "" ? boardTitle : undefined;
  const existingEntries = readOpenedBoardEntries();
  const existingIndex = existingEntries.findIndex(
    (entry) => normalizeBoardUrl(entry.url) === normalizedUrl,
  );

  if (existingIndex >= 0) {
    const existing = existingEntries[existingIndex];
    if (!nextTitle || existing.title === nextTitle) {
      return;
    }

    const updated = [...existingEntries];
    updated[existingIndex] = { ...existing, title: nextTitle };
    writeOpenedBoardEntries(updated);
    return;
  }

  // 変更理由: readState/history 未生成でも「一度開いた板」に残せるよう、
  // スレ一覧を開いた時点で板URLを明示記録する。
  writeOpenedBoardEntries([{ url: normalizedUrl, title: nextTitle || "" }, ...existingEntries]);
}

function isResolvedBoardTitle(boardUrl: string, candidate: string): boolean {
  if (!candidate || candidate === boardUrl) {
    return false;
  }

  // 変更理由: 履歴/候補生成の一部は boardTitle に host/path 形式の仮ラベルを入れるため、
  // それを確定タイトル扱いすると実板名の再解決が止まり URL 風タイトルが残る。
  return candidate !== deriveBoardTitlePlaceholder(boardUrl);
}

function resolveInitialBoardTitle(page: ThreadListPageType): string | null {
  if (isResolvedBoardTitle(page.boardUrl, page.title)) {
    return page.title;
  }

  if (isResolvedBoardTitle(page.boardUrl, page.boardTitle)) {
    return page.boardTitle;
  }

  return null;
}

function calcHeat(now: number, created: number, resCount: number): string {
  if (!Number.isFinite(created) || created > now) return "0.0";
  const elapsed = Math.max((now - created) / 1000, 1) / (24 * 60 * 60);
  return (resCount / elapsed).toFixed(1);
}

type DisplayThread = {
  thread: IThread;
  originalIndex: number;
  unreadCount: number;
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
          {hlParams?.label && <span className="thread-list__label">{hlParams.label}</span>}
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
    key: "unreadCount",
    header: "未読",
    headerClassName: "thread-list__th--count",
    cellClassName: "thread-list__count",
    sortable: true,
    cell: ({ unreadCount }) => (unreadCount > 0 ? unreadCount : ""),
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
  isAutoRefreshEnabled = false,
  scrollContainerRef,
}) => {
  const fallbackScrollContainerRef = useRef<HTMLDivElement>(null);
  const effectiveScrollContainerRef = scrollContainerRef ?? fallbackScrollContainerRef;
  const dispatch = useTabDispatch();
  const { state: persistedViewState, update: updateViewState } = useTabViewState(tabId, page);
  const persistedSearchQuery = persistedViewState.searchQuery;
  const persistedSortColumn = persistedViewState.sortColumn;
  const persistedSortDirection = persistedViewState.sortDirection;
  const { isNgTemporarilyDisabled, setThreadListStats } = useNgStatus();
  const theme = useTheme();
  const [threads, setThreads] = useState<IThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boardAutoRefreshIntervalMs, setBoardAutoRefreshIntervalMs] = useState(
    readBoardAutoRefreshIntervalMs,
  );
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    document.visibilityState === "visible",
  );
  const [sortPreference, setSortPreference] = useState<ThreadListSortPreference>(() => {
    const column = persistedSortColumn;
    if (column === null) {
      return {
        column: null,
        direction: persistedSortDirection === "desc" ? "desc" : "asc",
      };
    }
    if (typeof column === "string" && isSortColumn(column)) {
      return {
        column,
        direction: persistedSortDirection === "desc" ? "desc" : "asc",
      };
    }
    return readThreadListSortPreference(page.boardUrl);
  });
  const [searchQuery, setSearchQuery] = useState(() => persistedSearchQuery ?? "");
  const previousBoardUrlRef = useRef(page.boardUrl);
  const skipViewStateUpdateRef = useRef(false);
  // 変更理由: 更新開始後のloading中もwheel更新の共有cooldownとindicatorを維持し、
  // 画面切替で別の一覧/スレッドから連続更新できる隙間を作らない。
  const wheelPagination = useWheelPagination({
    isEnabled: isActive,
    isLoading: loading,
    containerRef: effectiveScrollContainerRef,
    edge: "top",
    onRefresh: () => dispatch({ type: "RELOAD" }),
  });
  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    pageType: "threadList",
    tabId,
    isActive,
    searchQuery,
    setSearchQuery,
  });
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
    thread: IThread;
  } | null>(null);
  const [ngDialogThread, setNgDialogThread] = useState<IThread | null>(null);
  const [ngTitleDraft, setNgTitleDraft] = useState("");
  const [ngDialogSaving, setNgDialogSaving] = useState(false);
  const [ngDialogError, setNgDialogError] = useState<string | null>(null);
  const { column: sortColumn, direction: sortDirection } = sortPreference;

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // container経由でBoardサービスにアクセス
      const result = await container.board.getThreads(page.boardUrl);
      setThreads(result.threads);
      void setThreadListCache(page.boardUrl, result.threads);
      // 戻る操作直後は「取得成功 + 注意メッセージ」が返る場合があるため、
      // 一覧を描画できる件数がある間はエラー文言を出さずUIの連続性を優先する。
      if (result.message && result.threads.length === 0) {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "スレッド一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
    // refreshKeyが変わったとき（更新ボタン押下）に再取得を走らせる
  }, [page.boardUrl, refreshKey]);

  // 変更理由: IDBキャッシュから前回のスレ一覧を復元し、新しいデータの取得中は古い結果を表示し続ける。
  useEffect(() => {
    void (async () => {
      const cached = await getThreadListCache(page.boardUrl);
      if (cached && cached.length > 0) {
        setThreads(cached);
      }
    })();
  }, [page.boardUrl]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    // NG設定が更新されたら、一覧のスレッドに対しても判定を再実行する。
    const handleNgChanged = () => {
      setThreads((prev) =>
        prev.map((thread) => {
          const ngResult = container.ng.isNGBoard(thread.title, page.boardUrl, thread.resCount);
          // 変更理由: hideは一覧から除外し、demoteだけを折りたたみ領域へ送る。
          const highlight =
            ngResult?.action === "highlight" ||
            ngResult?.type === "HighlightTitle" ||
            ngResult?.type === "RegExpHighlightTitle";
          const demoted = ngResult?.action === "demote";

          return {
            ...thread,
            ng: highlight || demoted ? null : ngResult,
            demoted: demoted ? ngResult : null,
            highlight: highlight ? ngResult : null,
          };
        }),
      );
    };

    container.message.on("ng_changed", handleNgChanged);
    return () => {
      container.message.off("ng_changed", handleNgChanged);
    };
  }, [page.boardUrl]);

  useEffect(() => {
    const handleReadStateUpdated = ({
      board_url: boardUrl,
      read_state: readState,
    }: {
      board_url?: string;
      read_state?: IReadState;
    }) => {
      if (!readState || boardUrl !== page.boardUrl) {
        return;
      }

      setThreads((prev) =>
        prev.map((thread) => {
          if (thread.url !== readState.url) {
            return thread;
          }

          if (thread.readState && !container.util.isNewerReadState(thread.readState, readState)) {
            return thread;
          }

          return {
            ...thread,
            readState,
          };
        }),
      );
    };

    const handleReadStateRemoved = ({ url }: { url?: string }) => {
      if (!url) {
        return;
      }

      // 変更理由: スレ一覧タブは非アクティブ時も mounted のまま残るため、
      // 読了後に戻った時点で未読列が古いままにならないよう message で追従する。
      setThreads((prev) =>
        prev.map((thread) =>
          thread.url === url
            ? {
                ...thread,
                readState: undefined,
              }
            : thread,
        ),
      );
    };

    container.message.on("read_state_updated", handleReadStateUpdated);
    container.message.on("read_state_removed", handleReadStateRemoved);

    return () => {
      container.message.off("read_state_updated", handleReadStateUpdated);
      container.message.off("read_state_removed", handleReadStateRemoved);
    };
  }, [page.boardUrl]);

  useEffect(() => {
    if (previousBoardUrlRef.current === page.boardUrl) {
      return;
    }

    // 保存値は板を切り替えたときだけ復元する。入力中にも view state が更新されるため、
    // そのたびに同じ値をローカル状態へ戻すと、入力イベントと競合して文字が点滅する。
    previousBoardUrlRef.current = page.boardUrl;
    // 板切り替え直後は、復元前のローカル状態を新しい板へ保存しない。
    skipViewStateUpdateRef.current = true;
    const column = persistedSortColumn;
    const nextSortPreference: ThreadListSortPreference =
      column === null
        ? {
            column: null,
            direction: persistedSortDirection === "desc" ? "desc" : "asc",
          }
        : typeof column === "string" && isSortColumn(column)
          ? {
              column,
              direction: persistedSortDirection === "desc" ? "desc" : "asc",
            }
          : readThreadListSortPreference(page.boardUrl);

    setSortPreference((previous) =>
      previous.column === nextSortPreference.column &&
      previous.direction === nextSortPreference.direction
        ? previous
        : nextSortPreference,
    );
    setSearchQuery(persistedSearchQuery ?? "");
  }, [page.boardUrl, persistedSearchQuery, persistedSortColumn, persistedSortDirection]);

  useEffect(() => {
    if (skipViewStateUpdateRef.current) {
      skipViewStateUpdateRef.current = false;
      return;
    }

    updateViewState({
      searchQuery,
      sortColumn: sortPreference.column,
      sortDirection: sortPreference.direction,
    });
  }, [searchQuery, sortPreference, updateViewState]);

  useEffect(() => {
    writeThreadListSortPreference(page.boardUrl, sortPreference);
  }, [page.boardUrl, sortPreference]);

  useEffect(() => {
    const resolvedTitle = resolveInitialBoardTitle(page);
    upsertOpenedBoardEntry(page.boardUrl, resolvedTitle);
  }, [page.boardTitle, page.boardUrl, page.title]);

  useEffect(() => {
    let cancelled = false;

    // 変更理由: スレ一覧コンポーネントは再マウントされない経路があるため、
    // 「初回だけ取得」だと別板へ遷移した後のタイトルが更新されないことがある。
    const initialBoardTitle = resolveInitialBoardTitle(page);
    if (initialBoardTitle) {
      if (initialBoardTitle !== page.title) {
        dispatch({
          type: "UPDATE_TITLE_FOR_TAB",
          tabId,
          title: initialBoardTitle,
          boardUrl: page.boardUrl,
        });
      }
      return;
    }

    askBoardTitle(new ChURL(page.boardUrl))
      .then((title) => {
        if (!cancelled && title) {
          dispatch({ type: "UPDATE_TITLE_FOR_TAB", tabId, title, boardUrl: page.boardUrl });
        }
      })
      .catch((err) => {
        console.error(err);
      });

    return () => {
      cancelled = true;
    };
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
      !isAutoRefreshEnabled ||
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
    isAutoRefreshEnabled,
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
      unreadCount: Math.max(
        // 変更理由: read_state_updated で received が先行しているケースもあるため、
        // 既知レス数はスレ一覧の resCount と readState.received の大きい方を採用する。
        Math.max(t.resCount, t.readState?.received ?? 0) - (t.readState?.read ?? 0),
        0,
      ),
      heat: parseFloat(calcHeat(now, t.createdAt, t.resCount)),
    }));

    // テキスト検索フィルタ
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(({ thread }) => thread.title.toLowerCase().includes(q));
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
          case "unreadCount":
            cmp = a.unreadCount - b.unreadCount;
            break;
          case "heat":
            cmp = a.heat - b.heat;
            break;
        }
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }

    return list;
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

  // 空白部分のダブルクリックによる更新。
  // 設定が有効な場合に動作し、誤操作防止のためリンクやテキスト選択中などは除外する。
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (container.config.get("dblclick_reload") !== "on") {
        return;
      }

      const target = e.target as HTMLElement;

      // リンク、ボタン、入力系要素などは除外
      if (target.closest("a, button, input, textarea")) {
        return;
      }

      // テキスト選択中はリロードしない
      if (window.getSelection()?.toString()) {
        return;
      }

      dispatch({ type: "RELOAD" });
    },
    [dispatch],
  );

  const openThreadInNewTab = useCallback(
    ({ thread }: DisplayThread) => {
      // ミドルクリックはバックグラウンドで開く（設定に関わらず常にバックグラウンドタブ）
      dispatch({
        type: "OPEN_IN_NEW_TAB",
        page: { type: "thread", title: thread.title, threadUrl: thread.url },
        background: true,
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

  const openNgDialog = useCallback((thread: IThread) => {
    setNgDialogThread(thread);
    setNgTitleDraft(thread.title);
    setNgDialogError(null);
  }, []);

  const closeNgDialog = useCallback(() => {
    if (!ngDialogSaving) {
      setNgDialogThread(null);
      setNgDialogError(null);
    }
  }, [ngDialogSaving]);

  const registerThreadTitleNg = useCallback(async () => {
    const title = ngTitleDraft.trim();
    if (!title || ngDialogSaving) {
      return;
    }

    setNgDialogSaving(true);
    setNgDialogError(null);
    const ngRule = `hide title contains:\n  ${stringifyNgDslValue(title)}`;
    try {
      await container.ng.add(ngRule);
      container.toast.info(`スレタイをNGに追加しました: ${title}`);
      setNgDialogThread(null);
    } catch (error) {
      console.error("[ThreadListPage] thread title NG registration failed:", error);
      const message = error instanceof Error ? error.message : "NG登録に失敗しました";
      setNgDialogError(message);
      container.toast.error(message);
    } finally {
      setNgDialogSaving(false);
    }
  }, [ngDialogSaving, ngTitleDraft]);

  const contextMenuItems = useMemo(() => {
    if (!contextMenuState) return [];
    const { thread } = contextMenuState;
    const isBookmarked = container.bookmark?.get(thread.url);
    const items: ContextMenuItem[] = [
      {
        id: "ng-title",
        label: "スレタイをNG登録",
        onSelect: () => openNgDialog(thread),
      },
      {
        id: "bookmark",
        label: isBookmarked ? "ブックマークを削除" : "ブックマークに追加",
        icon: isBookmarked ? <BookmarkX /> : <Bookmark />,
        onSelect: () => {
          try {
            if (isBookmarked) {
              container.bookmark.remove(thread.url);
            } else {
              container.bookmark.add({
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
  }, [contextMenuState, openNgDialog]);

  const threadListNgCount = useMemo(
    () => threads.filter((thread) => thread.ng != null || thread.demoted != null).length,
    [threads],
  );
  const threadListHighlightCount = useMemo(
    () => threads.filter((thread) => thread.highlight != null).length,
    [threads],
  );
  const visibleDisplayThreads = useMemo(
    () => displayThreads.filter(({ thread }) => thread.ng == null || isNgTemporarilyDisabled),
    [displayThreads, isNgTemporarilyDisabled],
  );
  const threadSections = useMemo<DataTableSection<DisplayThread>[]>(() => {
    const highlightGroups = new Map<
      string,
      { label: string; color?: string; order: number; rows: DisplayThread[] }
    >();
    for (const item of visibleDisplayThreads) {
      const result = item.thread.highlight;
      if (!result) continue;
      // 変更理由: labelやcolorが同じでも、別のDSLルールなら独立したセクションとして扱う。
      const key =
        result.ruleIndex != null
          ? `rule-${result.ruleIndex}`
          : `legacy-${result.name ?? ""}-${result.params?.label ?? ""}-${result.params?.bgColor ?? ""}`;
      const existing = highlightGroups.get(key);
      if (existing) {
        existing.rows.push(item);
      } else {
        highlightGroups.set(key, {
          label: result.params?.label || result.name || "注目スレ",
          color: result.params?.bgColor,
          order: result.ruleIndex ?? Number.MAX_SAFE_INTEGER,
          rows: [item],
        });
      }
    }
    const normal = visibleDisplayThreads.filter(
      ({ thread }) =>
        thread.highlight == null && (isNgTemporarilyDisabled || thread.demoted == null),
    );
    const demoted = isNgTemporarilyDisabled
      ? []
      : visibleDisplayThreads.filter(({ thread }) => thread.demoted != null);

    return [
      ...Array.from(highlightGroups.entries())
        .sort(([, left], [, right]) => left.order - right.order)
        .map(([key, group]) => ({
          key: `highlight-${key}`,
          label: `${group.label}（${group.rows.length}）`,
          rows: group.rows,
          ...(group.color ? { dividerStyle: createHighlightDividerStyle(group.color) } : {}),
        })),
      ...(normal.length > 0
        ? [{ key: "normal", label: `スレ一覧（${normal.length}）`, rows: normal }]
        : []),
      ...(demoted.length > 0
        ? [
            {
              key: "demoted",
              label: `NGしたスレ（${demoted.length}）`,
              rows: demoted,
              collapsible: true,
              defaultCollapsed: true,
            },
          ]
        : []),
    ];
  }, [isNgTemporarilyDisabled, visibleDisplayThreads]);

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
    return (
      <div className="page-status">
        <Spinner size="sm" aria-label="スレ一覧を読み込み中" />
        <span>読み込み中...</span>
      </div>
    );
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
    <ThreadListView
      rows={[]}
      loading={false}
      error={null}
      query={searchQuery}
      onQueryChange={setSearchQuery}
      searchMode="custom"
      searchContent={
        isFilterOpen ? (
          <SearchBar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onClose={closeFilterToolbar}
            hitCount={visibleDisplayThreads.length}
          />
        ) : null
      }
      onDoubleClick={handleDoubleClick}
    >
      <WheelScrollIndicator {...wheelPagination} threshold={WHEEL_THRESHOLD} />
      {error && <div className="thread-list-page__notice">{error}</div>}
      <SimpleDataTable
        columns={THREAD_LIST_COLUMNS}
        rows={visibleDisplayThreads}
        sections={threadSections}
        getRowKey={({ thread }) => thread.url}
        getRowTooltip={({ thread }) => thread.title}
        getRowClassName={({ thread }) => {
          const classes: string[] = [];
          if (thread.demoted && !isNgTemporarilyDisabled) classes.push("thread-list__row--ng");
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
        onRowContextMenu={({ thread }, x, y) => setContextMenuState({ x, y, thread })}
        sortColumn={sortColumn ?? undefined}
        sortDirection={sortDirection}
        onSort={handleTableSort}
        columnVisibilityStorageKey={THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY}
        columnVisibilityLockedKeys={THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS}
      />
      {contextMenuState && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          items={contextMenuItems}
          onClose={() => setContextMenuState(null)}
        />
      )}
      {ngDialogThread && (
        <div className="bookmark-root-dialog thread-ng-dialog" role="presentation">
          <button
            type="button"
            className="bookmark-root-dialog__backdrop"
            aria-label="スレタイNG登録を閉じる"
            onClick={closeNgDialog}
          />
          <div
            className="bookmark-root-dialog__panel thread-ng-dialog__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="thread-ng-dialog-title"
          >
            <div className="bookmark-root-dialog__header">
              <div>
                <p className="bookmark-root-dialog__eyebrow">Thread NG</p>
                <h2 id="thread-ng-dialog-title">スレタイをNG登録</h2>
              </div>
              <button
                type="button"
                className="bookmark-root-dialog__close"
                onClick={closeNgDialog}
                disabled={ngDialogSaving}
              >
                閉じる
              </button>
            </div>
            <p className="bookmark-root-dialog__description">
              NGに登録するスレタイを編集してください。登録後はこのタイトルを含むスレッドが非表示になります。
            </p>
            {ngDialogError && <p className="bookmark-root-dialog__error">{ngDialogError}</p>}
            <label className="thread-ng-dialog__field">
              <span>スレタイ</span>
              <textarea
                value={ngTitleDraft}
                onChange={(event) => setNgTitleDraft(event.target.value)}
                rows={3}
                autoFocus
              />
            </label>
            <div className="bookmark-root-dialog__actions">
              <button
                type="button"
                className="bookmark-root-dialog__button"
                onClick={closeNgDialog}
                disabled={ngDialogSaving}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="bookmark-root-dialog__button bookmark-root-dialog__button--primary"
                onClick={() => void registerThreadTitleNg()}
                disabled={!ngTitleDraft.trim() || ngDialogSaving}
              >
                {ngDialogSaving ? "登録中..." : "登録"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ThreadListView>
  );
};
