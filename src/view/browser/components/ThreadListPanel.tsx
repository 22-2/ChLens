import { Ban, Bookmark, BookmarkX, Check, RefreshCw, Search } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stringifyNgDslValue } from "src/core/ngDsl";
import { container } from "src/service-container/index";
import type { IReadState, IThread } from "src/service-container/interfaces";
import { SearchBar } from "src/view/browser/components/SearchBar";
import {
  SimpleDataTable,
  type DataTableSection,
} from "src/view/browser/components/SimpleDataTable";
import {
  calcHeat,
  createHighlightDividerStyle,
  createHighlightRowStyle,
  getThreadListCache,
  isSortColumn,
  readThreadListSortPreference,
  setThreadListCache,
  THREAD_LIST_COLUMNS,
  THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS,
  THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY,
  type DisplayThread,
  type ThreadListSortColumn,
  type ThreadListSortPreference,
  writeThreadListSortPreference,
} from "src/view/browser/components/thread-list-shared";
import {
  THREAD_LIST_AUTO_REFRESH_INTERVALS_SEC,
  useBottomPanel,
} from "src/view/browser/hooks/use-bottom-panel";
import { useNgStatus } from "src/view/browser/hooks/use-ng-status";
import { useTabStore, useTabViewState } from "src/view/browser/hooks/use-tab-store";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { ContextMenu, type ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { copyText, formatMarkdownLink } from "src/view/browser/utils/clipboard";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";

interface ThreadListPanelProps {
  threadUrl: string;
}

interface MenuPosition {
  x: number;
  y: number;
}

interface BoardDescriptor {
  boardUrl: string;
  boardTitle: string;
}

function deriveFallbackBoardUrl(threadUrl: string): string {
  const boardUrl = getBoardUrlFromThreadUrl(threadUrl);
  if (boardUrl !== threadUrl) {
    return boardUrl;
  }

  try {
    const parsed = new window.URL(threadUrl);
    const match = parsed.pathname.match(/^(?:\/[^/]+)?\/test\/read\.cgi\/([\w-]+)\/\d+\/?/);
    return match ? `${parsed.origin}/${match[1]}/` : threadUrl;
  } catch {
    return threadUrl;
  }
}

function normalizeLocation(rawLocation: string): string {
  try {
    const parsed = new window.URL(rawLocation);
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "/");
  } catch {
    return rawLocation.trim().replace(/\/+$/, "");
  }
}

function resolveBoardTitle(
  boardUrl: string,
  threadTitle: string,
  history: ReturnType<typeof useTabStore>["activeTab"]["history"],
): string {
  const normalizedBoardUrl = normalizeLocation(boardUrl);
  const boardPage = [...history]
    .reverse()
    .find(
      (page) =>
        page.type === "threadList" && normalizeLocation(page.boardUrl) === normalizedBoardUrl,
    );
  if (
    boardPage?.type === "threadList" &&
    boardPage.boardTitle &&
    boardPage.boardTitle !== boardPage.boardUrl
  ) {
    return boardPage.boardTitle;
  }
  if (
    boardPage?.type === "threadList" &&
    boardPage.title &&
    boardPage.title !== boardPage.boardUrl
  ) {
    return boardPage.title;
  }

  try {
    const parsed = new window.URL(boardUrl);
    const boardKey = parsed.pathname.replace(/^\/+|\/+$/g, "");
    return boardKey ? `${parsed.hostname}/${boardKey}` : parsed.hostname;
  } catch {
    return threadTitle;
  }
}

function createBoardDescriptor(
  threadUrl: string,
  threadTitle: string,
  history: ReturnType<typeof useTabStore>["activeTab"]["history"],
): BoardDescriptor {
  const boardUrl = deriveFallbackBoardUrl(threadUrl);
  return {
    boardUrl,
    boardTitle: resolveBoardTitle(boardUrl, threadTitle, history),
  };
}

function refreshThreadNgState(thread: IThread, boardUrl: string): IThread {
  const ngResult = container.ng.isNGBoard(thread.title, boardUrl, thread.resCount);
  const highlight =
    ngResult?.action === "highlight" ||
    ngResult?.type === "HighlightTitle" ||
    ngResult?.type === "RegExpHighlightTitle";
  const demoted = ngResult?.action === "demote";

  // 変更理由: 板名を変えずにNGルールだけが更新された場合も、パネル上の一覧を
  // 即時に通常／強調／折りたたみへ振り分け直す必要がある。
  return {
    ...thread,
    ng: highlight || demoted ? null : ngResult,
    demoted: demoted ? ngResult : null,
    highlight: highlight ? ngResult : null,
  };
}

export const ThreadListPanel: React.FC<ThreadListPanelProps> = ({ threadUrl }) => {
  const { activeTab, currentPage, dispatch } = useTabStore();
  const { isNgTemporarilyDisabled, setThreadListStats } = useNgStatus();
  const theme = useTheme();
  const {
    threadListAutoRefreshEnabled,
    threadListAutoRefreshIntervalSec,
    setThreadListAutoRefreshEnabled,
    setThreadListAutoRefreshIntervalSec,
  } = useBottomPanel();
  const descriptor = useMemo(
    () => createBoardDescriptor(threadUrl, currentPage.title, activeTab.history),
    [activeTab.history, currentPage.title, threadUrl],
  );
  const boardPage = useMemo(
    () => ({
      type: "threadList" as const,
      title: descriptor.boardTitle,
      boardUrl: descriptor.boardUrl,
      boardTitle: descriptor.boardTitle,
    }),
    [descriptor.boardTitle, descriptor.boardUrl],
  );
  const { state: persistedViewState, update: updateViewState } = useTabViewState(
    activeTab.id,
    boardPage,
  );
  const [threads, setThreads] = useState<IThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => persistedViewState.searchQuery ?? "");
  const [isSearchOpen, setIsSearchOpen] = useState(() => Boolean(persistedViewState.searchQuery));
  const [sortPreference, setSortPreference] = useState<ThreadListSortPreference>(() => {
    const column = persistedViewState.sortColumn;
    if (column === null || (typeof column === "string" && isSortColumn(column))) {
      return {
        column: column as ThreadListSortColumn | null,
        direction: persistedViewState.sortDirection === "desc" ? "desc" : "asc",
      };
    }
    return readThreadListSortPreference(descriptor.boardUrl);
  });
  const [refreshMenuPosition, setRefreshMenuPosition] = useState<MenuPosition | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
    thread: IThread;
  } | null>(null);
  const [ngDialogThread, setNgDialogThread] = useState<IThread | null>(null);
  const [ngTitleDraft, setNgTitleDraft] = useState("");
  const [ngDialogSaving, setNgDialogSaving] = useState(false);
  const [ngDialogError, setNgDialogError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const previousBoardUrlRef = useRef(descriptor.boardUrl);
  const skipViewStateUpdateRef = useRef(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    document.visibilityState === "visible",
  );

  const fetchThreads = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await container.board.getThreads(descriptor.boardUrl);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setThreads(result.threads);
      void setThreadListCache(descriptor.boardUrl, result.threads);
      if (result.message && result.threads.length === 0) {
        setError(result.message);
      }
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      const message =
        fetchError instanceof Error ? fetchError.message : "スレッド一覧の取得に失敗しました";
      console.error("[ThreadListPanel] thread list fetch failed:", fetchError);
      setError(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [descriptor.boardUrl]);

  useEffect(() => {
    let cancelled = false;
    setThreads([]);
    setLoading(true);
    setError(null);

    void getThreadListCache(descriptor.boardUrl).then((cached) => {
      if (!cancelled && cached && cached.length > 0) {
        setThreads(cached);
      }
    });
    void fetchThreads();

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [descriptor.boardUrl, fetchThreads]);

  useEffect(() => {
    if (previousBoardUrlRef.current === descriptor.boardUrl) {
      return;
    }

    previousBoardUrlRef.current = descriptor.boardUrl;
    // 板切り替え時は、前の板の検索・ソート状態を新しい板へ一度だけ書き込まない。
    // 次のレンダーで対象板の保存値を反映してから保存を再開する。
    skipViewStateUpdateRef.current = true;
    setSearchQuery(persistedViewState.searchQuery ?? "");
    setIsSearchOpen(Boolean(persistedViewState.searchQuery));
    const column = persistedViewState.sortColumn;
    setSortPreference(
      column === null || (typeof column === "string" && isSortColumn(column))
        ? {
            column: column as ThreadListSortColumn | null,
            direction: persistedViewState.sortDirection === "desc" ? "desc" : "asc",
          }
        : readThreadListSortPreference(descriptor.boardUrl),
    );
  }, [
    descriptor.boardUrl,
    persistedViewState,
    persistedViewState.searchQuery,
    persistedViewState.sortColumn,
    persistedViewState.sortDirection,
  ]);

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
    writeThreadListSortPreference(descriptor.boardUrl, sortPreference);
  }, [descriptor.boardUrl, searchQuery, sortPreference, updateViewState]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!threadListAutoRefreshEnabled || !isDocumentVisible) {
      return;
    }

    const timerId = window.setInterval(() => {
      if (!loading) {
        void fetchThreads();
      }
    }, threadListAutoRefreshIntervalSec * 1000);
    return () => window.clearInterval(timerId);
  }, [
    fetchThreads,
    isDocumentVisible,
    loading,
    threadListAutoRefreshEnabled,
    threadListAutoRefreshIntervalSec,
  ]);

  useEffect(() => {
    const handleNgChanged = () => {
      setThreads((current) =>
        current.map((thread) => refreshThreadNgState(thread, descriptor.boardUrl)),
      );
    };
    container.message.on("ng_changed", handleNgChanged);
    return () => container.message.off("ng_changed", handleNgChanged);
  }, [descriptor.boardUrl]);

  useEffect(() => {
    const handleReadStateUpdated = ({ read_state: readState }: { read_state?: IReadState }) => {
      if (!readState) return;
      setThreads((current) =>
        current.map((thread) => {
          if (thread.url !== readState.url) return thread;
          if (thread.readState && !container.util.isNewerReadState(thread.readState, readState)) {
            return thread;
          }
          return { ...thread, readState };
        }),
      );
    };
    const handleReadStateRemoved = ({ url }: { url?: string }) => {
      if (!url) return;
      setThreads((current) =>
        current.map((thread) =>
          thread.url === url ? { ...thread, readState: undefined } : thread,
        ),
      );
    };
    container.message.on("read_state_updated", handleReadStateUpdated);
    container.message.on("read_state_removed", handleReadStateRemoved);
    return () => {
      container.message.off("read_state_updated", handleReadStateUpdated);
      container.message.off("read_state_removed", handleReadStateRemoved);
    };
  }, []);

  const { column: sortColumn, direction: sortDirection } = sortPreference;
  const displayThreads = useMemo(() => {
    const now = Date.now();
    const list = threads.map((thread, index) => ({
      thread,
      originalIndex: index + 1,
      unreadCount: Math.max(
        Math.max(thread.resCount, thread.readState?.received ?? 0) - (thread.readState?.read ?? 0),
        0,
      ),
      heat: Number.parseFloat(calcHeat(now, thread.createdAt, thread.resCount)),
    }));

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list.splice(
        0,
        list.length,
        ...list.filter(({ thread }) => thread.title.toLowerCase().includes(query)),
      );
    }

    if (sortColumn) {
      list.sort((left, right) => {
        let comparison = 0;
        switch (sortColumn) {
          case "num":
            comparison = left.originalIndex - right.originalIndex;
            break;
          case "title":
            comparison = left.thread.title.localeCompare(right.thread.title, "ja");
            break;
          case "resCount":
            comparison = left.thread.resCount - right.thread.resCount;
            break;
          case "unreadCount":
            comparison = left.unreadCount - right.unreadCount;
            break;
          case "heat":
            comparison = left.heat - right.heat;
            break;
        }
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }
    return list;
  }, [searchQuery, sortColumn, sortDirection, threads]);

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

  const ngCount = useMemo(
    () => threads.filter((thread) => thread.ng != null || thread.demoted != null).length,
    [threads],
  );
  const highlightCount = useMemo(
    () => threads.filter((thread) => thread.highlight != null).length,
    [threads],
  );

  useEffect(() => {
    setThreadListStats({ ngCount, highlightCount });
    return () => setThreadListStats({ ngCount: 0, highlightCount: 0 });
  }, [highlightCount, ngCount, setThreadListStats]);

  const handleSort = useCallback((column: ThreadListSortColumn) => {
    setSortPreference((current) => {
      if (current.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return { column: null, direction: "asc" };
    });
  }, []);

  const handleSearchToggle = useCallback(() => {
    if (isSearchOpen) {
      setSearchQuery("");
      setIsSearchOpen(false);
    } else {
      setIsSearchOpen(true);
    }
  }, [isSearchOpen]);

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
    if (!title || ngDialogSaving) return;
    setNgDialogSaving(true);
    setNgDialogError(null);
    const ngRule = `hide title contains:\n  ${stringifyNgDslValue(title)}`;
    try {
      await container.ng.add(ngRule);
      container.toast.info(`スレタイをNGに追加しました: ${title}`);
      setNgDialogThread(null);
    } catch (registerError) {
      console.error("[ThreadListPanel] thread title NG registration failed:", registerError);
      const message =
        registerError instanceof Error ? registerError.message : "NG登録に失敗しました";
      setNgDialogError(message);
      container.toast.error(message);
    } finally {
      setNgDialogSaving(false);
    }
  }, [ngDialogSaving, ngTitleDraft]);

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenuState) return [];
    const { thread } = contextMenuState;
    const isBookmarked = container.bookmark?.get(thread.url);
    return [
      { id: "ng-title", label: "スレタイをNG登録", onSelect: () => openNgDialog(thread) },
      {
        id: "bookmark",
        label: isBookmarked ? "ブックマークを削除" : "ブックマークに追加",
        icon: isBookmarked ? <BookmarkX /> : <Bookmark />,
        onSelect: () => {
          try {
            if (isBookmarked) {
              container.bookmark.remove(thread.url);
            } else {
              container.bookmark.add({ url: thread.url, title: thread.title, type: "thread" });
            }
          } catch (bookmarkError) {
            console.error("[ThreadListPanel] bookmark update failed:", bookmarkError);
          }
        },
      },
      { id: "copy-title", label: "スレタイをコピー", onSelect: () => void copyText(thread.title) },
      { id: "copy-url", label: "URLをコピー", onSelect: () => void copyText(thread.url) },
      {
        id: "copy-title-url",
        label: "スレタイ&URLをコピー",
        onSelect: () => void copyText(`${thread.title}\n${thread.url}`),
      },
      {
        id: "copy-title-url-markdown",
        label: "スレタイ&URLをMarkdownでコピー",
        onSelect: () => void copyText(formatMarkdownLink(thread.title, thread.url)),
      },
    ];
  }, [contextMenuState, openNgDialog]);

  const refreshMenuItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        id: "auto-off",
        label: "自動更新しない",
        icon: !threadListAutoRefreshEnabled ? <Check size={14} /> : undefined,
        onSelect: () => setThreadListAutoRefreshEnabled(false),
      },
      { id: "refresh-options", separator: true },
      ...THREAD_LIST_AUTO_REFRESH_INTERVALS_SEC.map((seconds) => ({
        id: `auto-${seconds}`,
        label: `${seconds}秒`,
        icon:
          threadListAutoRefreshEnabled && threadListAutoRefreshIntervalSec === seconds ? (
            <Check size={14} />
          ) : undefined,
        onSelect: () => {
          setThreadListAutoRefreshIntervalSec(seconds);
          setThreadListAutoRefreshEnabled(true);
        },
      })),
    ],
    [
      setThreadListAutoRefreshEnabled,
      setThreadListAutoRefreshIntervalSec,
      threadListAutoRefreshEnabled,
      threadListAutoRefreshIntervalSec,
    ],
  );

  const currentThreadUrl = currentPage.type === "thread" ? currentPage.threadUrl : threadUrl;

  return (
    <div className="thread-list-panel">
      <div className="thread-list-panel__toolbar" role="toolbar" aria-label="スレ一覧操作">
        <span className="thread-list-panel__board-title" title={descriptor.boardUrl}>
          {descriptor.boardTitle}
        </span>
        <div className="thread-list-panel__toolbar-actions">
          <span
            className="thread-list-panel__ng-count"
            title={`NG ${ngCount}件、強調 ${highlightCount}件`}
            aria-label={`NG ${ngCount}件、強調 ${highlightCount}件`}
          >
            <Ban size={14} />
            <span>{ngCount}</span>
          </span>
          <button
            type="button"
            className={`thread-list-panel__toolbar-btn${isSearchOpen ? " thread-list-panel__toolbar-btn--active" : ""}`}
            title="スレタイ検索"
            aria-label="スレタイ検索"
            aria-pressed={isSearchOpen}
            onClick={handleSearchToggle}
          >
            <Search size={14} />
          </button>
          <button
            type="button"
            className={`thread-list-panel__toolbar-btn${threadListAutoRefreshEnabled ? " thread-list-panel__toolbar-btn--active" : ""}`}
            title={`一覧を更新（左クリック: 今すぐ更新、右クリック: 自動更新設定${threadListAutoRefreshEnabled ? `・現在 ${threadListAutoRefreshIntervalSec}秒` : ""}）`}
            aria-label="スレ一覧を更新"
            onClick={() => void fetchThreads()}
            onContextMenu={(event) => {
              event.preventDefault();
              setRefreshMenuPosition({ x: event.clientX, y: event.clientY });
            }}
          >
            <RefreshCw size={14} className={loading ? "icon--spinning" : undefined} />
          </button>
        </div>
      </div>
      {isSearchOpen && (
        <SearchBar
          className="thread-list-panel__search-bar"
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={() => {
            setSearchQuery("");
            setIsSearchOpen(false);
          }}
          hitCount={visibleDisplayThreads.length}
          placeholder="スレタイを検索..."
        />
      )}
      <div className="thread-list-panel__table-scroller">
        {error && threads.length > 0 && <div className="thread-list-page__notice">{error}</div>}
        {loading && threads.length === 0 ? (
          <div className="thread-list-panel__status">読み込み中...</div>
        ) : error && threads.length === 0 ? (
          <div className="thread-list-panel__status thread-list-panel__status--error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void fetchThreads()}>
              再試行
            </button>
          </div>
        ) : (
          <>
            {!loading && visibleDisplayThreads.length === 0 && (
              <div className="thread-list-panel__status">該当するスレはありません</div>
            )}
            <SimpleDataTable
              columns={THREAD_LIST_COLUMNS}
              rows={visibleDisplayThreads}
              sections={threadSections}
              getRowKey={({ thread }) => thread.url}
              getRowTooltip={({ thread }) => thread.title}
              getRowClassName={({ thread }) => {
                const classes: string[] = [];
                if (thread.url === currentThreadUrl)
                  classes.push("thread-list-panel__row--current");
                if (thread.demoted && !isNgTemporarilyDisabled)
                  classes.push("thread-list__row--ng");
                if (thread.highlight) classes.push("thread-list__row--highlight");
                return classes.join(" ") || undefined;
              }}
              getRowStyle={({ thread }) => {
                const bgColor = thread.highlight?.params?.bgColor;
                return bgColor ? createHighlightRowStyle(bgColor, theme) : {};
              }}
              onRowClick={({ thread }) =>
                dispatch({
                  type: "NAVIGATE",
                  page: { type: "thread", title: thread.title, threadUrl: thread.url },
                })
              }
              onRowMiddleClick={({ thread }) =>
                dispatch({
                  type: "OPEN_IN_NEW_TAB",
                  page: { type: "thread", title: thread.title, threadUrl: thread.url },
                  background: true,
                })
              }
              onRowContextMenu={({ thread }, x, y) => setContextMenuState({ thread, x, y })}
              sortColumn={sortColumn ?? undefined}
              sortDirection={sortDirection}
              onSort={(column) => {
                if (isSortColumn(column)) handleSort(column);
              }}
              columnVisibilityStorageKey={THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY}
              columnVisibilityLockedKeys={THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS}
            />
          </>
        )}
      </div>
      {contextMenuState && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          items={contextMenuItems}
          onClose={() => setContextMenuState(null)}
        />
      )}
      {refreshMenuPosition && (
        <ContextMenu
          x={refreshMenuPosition.x}
          y={refreshMenuPosition.y}
          items={refreshMenuItems}
          onClose={() => setRefreshMenuPosition(null)}
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
            aria-labelledby="thread-list-panel-ng-dialog-title"
          >
            <div className="bookmark-root-dialog__header">
              <div>
                <p className="bookmark-root-dialog__eyebrow">Thread NG</p>
                <h2 id="thread-list-panel-ng-dialog-title">スレタイをNG登録</h2>
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
              次のスレタイをNGワードへ追加します。
            </p>
            <label className="thread-ng-dialog__field">
              <span>スレタイ</span>
              <textarea
                value={ngTitleDraft}
                onChange={(event) => setNgTitleDraft(event.target.value)}
                rows={3}
              />
            </label>
            {ngDialogError && <p className="bookmark-root-dialog__error">{ngDialogError}</p>}
            <div className="bookmark-root-dialog__actions">
              <button
                type="button"
                className="bookmark-root-dialog__secondary"
                onClick={closeNgDialog}
                disabled={ngDialogSaving}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="bookmark-root-dialog__primary"
                onClick={() => void registerThreadTitleNg()}
                disabled={ngDialogSaving || !ngTitleDraft.trim()}
              >
                登録
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
