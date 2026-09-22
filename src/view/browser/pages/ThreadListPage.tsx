import React, { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask as askBoardTitle } from "src/core/BoardTitleSolver.js";
import { normalizeBoardUrl as normalizeKnownBoardUrl } from "src/core/BoardUrlNormalizer";
import { URL as ChURL } from "src/core/URL";
import { container } from "src/service-container/index";
import type { IReadState, IThread } from "src/service-container/interfaces";
import type { CommandRequest } from "src/view/browser/commands/command-runtime";
import { runCommandRequest } from "src/view/browser/commands/command-runtime";
import { ContextMenuNavigationActions } from "src/view/browser/components/ContextMenuNavigationActions";
import { SearchBar } from "src/view/browser/components/SearchBar";
import {
  type DataTableSection,
  SimpleDataTable,
} from "src/view/browser/components/SimpleDataTable";
import { createThreadContextMenuItems } from "src/view/browser/components/thread-context-menu-items";
import {
  calcHeat,
  createHighlightDividerStyle,
  type DisplayThread,
  getThreadListCache,
  getThreadUnreadCount,
  isSortColumn,
  isSortDirection,
  isThreadVisited,
  readThreadListSortPreference,
  setThreadListCache,
  THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS,
  THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY,
  THREAD_LIST_COLUMNS,
  type ThreadListSortColumn,
  type ThreadListSortPreference,
  writeThreadListSortPreference,
} from "src/view/browser/components/thread-list-shared";
import { ThreadTitleNgDialog } from "src/view/browser/components/ThreadTitleNgDialog";
import { WheelScrollIndicator } from "src/view/browser/components/WheelScrollIndicator";
import {
  BOARD_AUTO_REFRESH_CONFIG_KEY,
  MIN_BOARD_AUTO_REFRESH_MS,
  readBoardAutoRefreshIntervalMs,
} from "src/view/browser/hooks/auto-refresh-config";
import { tabActions } from "src/view/browser/hooks/tab-store-actions";
import {
  readBookmarkStatus,
  useBookmarkRevision,
} from "src/view/browser/hooks/use-bookmark-revision";
import { useNgStatus } from "src/view/browser/hooks/use-ng-status";
import {
  getThreadListPageCountKey,
  usePageCountStatus,
} from "src/view/browser/hooks/use-page-count-status";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import {
  useActivePaneId,
  usePaneId,
  useTabPanes,
  useTabStore,
  useTabViewState,
} from "src/view/browser/hooks/use-tab-store";
import { useTabViewRuntime } from "src/view/browser/hooks/use-tab-view-runtime";
import { useThreadTitleNgDialog } from "src/view/browser/hooks/use-thread-title-ng-dialog";
import { useWheelPagination, WHEEL_THRESHOLD } from "src/view/browser/hooks/useWheelPagination";
import { parseOpenedBoardEntries } from "src/view/browser/pages/board-list/board-list-utils";
import {
  canGoBack,
  canGoForward,
  getCurrentPage,
  type Tab,
  type ThreadListPage as ThreadListPageType,
} from "src/view/browser/types";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { Spinner } from "src/view/browser/ui/Spinner";
import {
  getAutoRefreshThreadPageKey,
  isAutoRefreshEnabledForPage,
} from "src/view/browser/utils/auto-refresh-pages";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";
import { SCOPED_SETTINGS_CONFIG_KEY } from "src/view/browser/utils/scoped-settings";
import { ThreadListView } from "src/view/shared/ThreadListView";

// 既存のページ用ユーティリティの公開位置を維持しつつ、パネル側と同じ定義を共有する。
export {
  calcHeat,
  createHighlightDividerStyle,
  getThreadListCache,
  isSortColumn,
  isSortDirection,
  readThreadListSortPreference,
  setThreadListCache,
  THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS,
  THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY,
  THREAD_LIST_COLUMNS,
  writeThreadListSortPreference,
};
export type {
  DisplayThread,
  ThreadListSortColumn,
  ThreadListSortDirection,
  ThreadListSortPreference,
} from "src/view/browser/components/thread-list-shared";
const OPENED_BOARDS_CONFIG_KEY = "opened_board_entries";
const MAX_OPENED_BOARD_ENTRIES = 500;

interface Props {
  tabId: string;
  // ContentAreaから描画対象を明示して受け取り、別の表示ホストでもペインのactiveTabに依存しない。
  tab?: Tab;
  page: ThreadListPageType;
  refreshKey: number;
  isActive: boolean;
  isAutoRefreshEnabled?: boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

function deriveBoardTitlePlaceholder(boardUrl: string): string | null {
  try {
    const parsed = new URL(boardUrl);
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

function readOpenedBoardEntries(): OpenedBoardEntry[] {
  const raw = container.config.get(OPENED_BOARDS_CONFIG_KEY);
  if (!raw) {
    return [];
  }

  return parseOpenedBoardEntries(raw).map((entry) => ({
    url: entry.url,
    title: entry.title ?? "",
  }));
}

function writeOpenedBoardEntries(entries: OpenedBoardEntry[]): void {
  void container.config.set(
    OPENED_BOARDS_CONFIG_KEY,
    JSON.stringify(entries.slice(0, MAX_OPENED_BOARD_ENTRIES)),
  );
}

function upsertOpenedBoardEntry(boardUrl: string, boardTitle: string | null): void {
  const normalizedUrl = normalizeKnownBoardUrl(boardUrl, { requireCompatibleHost: true });
  if (normalizedUrl === null) {
    // 変更理由: 外部サイトをスレ一覧の板として記録するとBBSMENUへ混入するため、
    // 掲示板URLとして判定できないページは保存対象から除外する。
    return;
  }
  const nextTitle = boardTitle && boardTitle.trim() !== "" ? boardTitle : undefined;
  const existingEntries = readOpenedBoardEntries();
  const existingIndex = existingEntries.findIndex((entry) => entry.url === normalizedUrl);

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

export const ThreadListPage: React.FC<Props> = ({
  tabId,
  tab,
  page,
  refreshKey,
  isActive,
  isAutoRefreshEnabled = false,
  scrollContainerRef,
}) => {
  const { surface: viewSurface, dispatch, toast } = useTabViewRuntime(tabId);
  const { window: viewWindow, document: viewDocument } = viewSurface;
  const runTargetCommand = useCallback(
    (request: CommandRequest) => {
      void runCommandRequest(request, { surface: viewSurface, toast });
    },
    [toast, viewSurface],
  );
  const fallbackScrollContainerRef = useRef<HTMLDivElement>(null);
  const effectiveScrollContainerRef = scrollContainerRef ?? fallbackScrollContainerRef;
  const { viewTab } = useTabStore();
  // 既存の直接利用者との互換性のため渡されたtabを残し、通常の描画経路ではそれを優先する。
  const navigationTab = tab ?? viewTab;
  const { state: persistedViewState, update: updateViewState } = useTabViewState(tabId, page);
  const persistedSearchQuery = persistedViewState.searchQuery;
  const persistedSortColumn = persistedViewState.sortColumn;
  const persistedSortDirection = persistedViewState.sortDirection;
  const { isNgTemporarilyDisabled, setThreadListStats } = useNgStatus();
  const { setPageCount } = usePageCountStatus();
  const pageCountKey = getThreadListPageCountKey(tabId, page.boardUrl);
  const bookmarkRevision = useBookmarkRevision();
  const [threads, setThreads] = useState<IThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boardAutoRefreshIntervalMs, setBoardAutoRefreshIntervalMs] = useState(() =>
    readBoardAutoRefreshIntervalMs(page.boardUrl),
  );
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    viewDocument.visibilityState === "visible",
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
  // 変更理由: 非表示中の read_state 系 message を保留し、表示復帰時に適用するため。
  // 2ペイン時は自ペインの表タブでもフォーカス外なら裏側扱いにし、スレ側の
  // 自動更新による既読書き換えで一覧がチラつかないようにする。
  // タイマー実行自体は止めない（フォーカス外でも自動更新は継続する）。
  const ownPaneId = usePaneId();
  const focusedPaneId = useActivePaneId();
  const { panes } = useTabPanes();
  const isForeground = isActive && ownPaneId === focusedPaneId;
  const isForegroundRef = useRef(isForeground);
  isForegroundRef.current = isForeground;
  const autoRefreshingThreadPageKeys = useMemo(() => {
    const pageKeys = new Set<string>();

    for (const pane of panes) {
      const activeTab = pane.tabs.find((tab) => tab.id === pane.activeTabId);
      if (!activeTab) {
        continue;
      }

      const activePage = getCurrentPage(activeTab);
      if (activePage.type === "thread" && isAutoRefreshEnabledForPage(activeTab, activePage)) {
        pageKeys.add(getAutoRefreshThreadPageKey(activePage.threadUrl));
      }
    }

    return pageKeys;
  }, [panes]);
  const autoRefreshingThreadPageKeysRef = useRef(autoRefreshingThreadPageKeys);
  autoRefreshingThreadPageKeysRef.current = autoRefreshingThreadPageKeys;
  const pendingReadStateRef = useRef<{ updated: IReadState[]; removed: string[] }>({
    updated: [],
    removed: [],
  });
  // 変更理由: 長時間フォーカスが戻らない場合も想定し、同一スレの古い既読は
  // 最新だけ残して保留列の肥大化を防ぐ。ref のみ触るため useCallback で固定する。
  const enqueuePendingReadState = useCallback((readState: IReadState) => {
    const pending = pendingReadStateRef.current.updated;
    const existingIndex = pending.findIndex((entry) => entry.url === readState.url);
    if (existingIndex >= 0) {
      pending[existingIndex] = readState;
      return;
    }
    pending.push(readState);
    if (pending.length > 500) {
      pending.splice(0, pending.length - 500);
    }
  }, []);
  // 変更理由: 更新開始後のloading中もwheel更新の共有cooldownとindicatorを維持し、
  // 画面切替で別の一覧/スレッドから連続更新できる隙間を作らない。
  const wheelPagination = useWheelPagination({
    isEnabled: isActive,
    isLoading: loading,
    containerRef: effectiveScrollContainerRef,
    edge: "top",
    onRefresh: () => dispatch(tabActions.reload()),
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
  const threadTitleNgDialog = useThreadTitleNgDialog({
    toast,
    logLabel: "ThreadListPage",
  });
  const { open: openThreadTitleNgDialog } = threadTitleNgDialog;
  const { column: sortColumn, direction: sortDirection } = sortPreference;

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // container経由でBoardサービスにアクセス
      const result = await container.board.getThreads(page.boardUrl);
      setThreads(result.threads);
      if (result.threads.length > 0 || !result.message) {
        // 変更理由: 注意メッセージ付きの空結果で直前の正常キャッシュを上書きすると、
        // 戻る操作時に復元できず誤警告だけが残るため、失敗相当の空結果は保存しない。
        void setThreadListCache(page.boardUrl, result.threads);
      }
      // 戻る操作直後は「取得成功 + 注意メッセージ」が返る場合があるため、
      // 一覧を描画できる件数がある間はエラー文言を出さずUIの連続性を優先する。
      if (result.message && result.threads.length === 0) {
        const cached = await getThreadListCache(page.boardUrl);
        if (cached && cached.length > 0) {
          // 変更理由: 初回起動後に履歴からスレ一覧へ戻る際、サービスの注意メッセージと
          // IDBキャッシュ復元が競合しても、表示可能な一覧があるなら誤警告を出さない。
          setThreads(cached);
        } else {
          setError(result.message);
        }
      }
    } catch (e) {
      console.error("[ChLens] スレッド一覧の取得に失敗しました:", {
        boardUrl: page.boardUrl,
        error: e,
      });
      const cached = await getThreadListCache(page.boardUrl);
      if (cached && cached.length > 0) {
        // 変更理由: 一時的な通信失敗でもキャッシュから一覧を復元できる場合は、画面上部を
        // エラーで塞がず、利用可能な直前データを優先する。詳細な失敗はログに残す。
        setThreads(cached);
      } else {
        setError(e instanceof Error ? e.message : "スレッド一覧の取得に失敗しました");
      }
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
    const applyReadStateUpdated = (readState: IReadState) => {
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

    const applyReadStateRemoved = (url: string) => {
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

    // 変更理由: 2ペイン時、スレ側の自動更新で既読位置が進むたび global な
    // read_state_updated が飛び、裏側の一覧まで毎回書き換わって「勝手に自動更新」
    // に見えていた。フォアグラウンド（一覧タブ表示中かつ自ペインフォーカス中）
    // 以外の間は保留し、復帰時にまとめて適用することで裏側のチラつきを抑えつつ
    // 未読列の鮮度も保つ。タイマー実行自体は止めない。
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

      if (!isForegroundRef.current) {
        enqueuePendingReadState(readState);
        return;
      }

      // 変更理由: フォーカスが一覧側へ移っても、別ペインのスレ自動更新が
      // 既読通知を送るたびに一覧の未読数を書き換えると、一覧自身が自動更新
      // されたように見える。自動更新中のスレ由来の通知は、その処理が終わる
      // まで保留し、一覧の表示をユーザー操作なしで動かさない。
      if (autoRefreshingThreadPageKeysRef.current.has(getAutoRefreshThreadPageKey(readState.url))) {
        enqueuePendingReadState(readState);
        return;
      }
      applyReadStateUpdated(readState);
    };

    const handleReadStateRemoved = ({ url }: { url?: string }) => {
      if (!url) {
        return;
      }

      if (!isForegroundRef.current) {
        pendingReadStateRef.current.removed.push(url);
        return;
      }
      applyReadStateRemoved(url);
    };

    container.message.on("read_state_updated", handleReadStateUpdated);
    container.message.on("read_state_removed", handleReadStateRemoved);

    return () => {
      container.message.off("read_state_updated", handleReadStateUpdated);
      container.message.off("read_state_removed", handleReadStateRemoved);
    };
  }, [enqueuePendingReadState, page.boardUrl]);

  useEffect(() => {
    if (!isForeground) {
      return;
    }
    // フォアグラウンド復帰時に保留分をまとめて反映する。ネットワーク再取得はしない。
    const pending = pendingReadStateRef.current;
    const deferredUpdated = pending.updated.filter((readState) =>
      autoRefreshingThreadPageKeys.has(getAutoRefreshThreadPageKey(readState.url)),
    );
    const applicableUpdated = pending.updated.filter(
      (readState) => !autoRefreshingThreadPageKeys.has(getAutoRefreshThreadPageKey(readState.url)),
    );
    if (applicableUpdated.length === 0 && pending.removed.length === 0) {
      return;
    }
    // 自動更新中のスレ由来の通知は、フォーカスが一覧へ戻っても保留を続ける。
    // タブ側の自動更新状態が解除されたレンダーで、deferredUpdated も反映される。
    pendingReadStateRef.current = { updated: deferredUpdated, removed: [] };
    for (const readState of applicableUpdated) {
      setThreads((prev) =>
        prev.map((thread) => {
          if (thread.url !== readState.url) {
            return thread;
          }
          if (thread.readState && !container.util.isNewerReadState(thread.readState, readState)) {
            return thread;
          }
          return { ...thread, readState };
        }),
      );
    }
    for (const url of pending.removed) {
      setThreads((prev) =>
        prev.map((thread) => (thread.url === url ? { ...thread, readState: undefined } : thread)),
      );
    }
  }, [autoRefreshingThreadPageKeys, isForeground]);

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
        dispatch(tabActions.updateTitleForTab(tabId, initialBoardTitle, page.boardUrl));
      }
      return;
    }

    askBoardTitle(new ChURL(page.boardUrl))
      .then((title) => {
        if (!cancelled && title) {
          dispatch(tabActions.updateTitleForTab(tabId, title, page.boardUrl));
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
      setIsDocumentVisible(viewDocument.visibilityState === "visible");
    };

    viewDocument.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      viewDocument.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [viewDocument]);

  useEffect(() => {
    const applyInterval = () => {
      setBoardAutoRefreshIntervalMs(readBoardAutoRefreshIntervalMs(page.boardUrl));
    };

    // 変更理由: 板一覧のタイマーも対象板の上書きを読むため、
    // 共通設定とスコープ設定のどちらが変わっても現在値を再評価する。
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === BOARD_AUTO_REFRESH_CONFIG_KEY || key === SCOPED_SETTINGS_CONFIG_KEY) {
        applyInterval();
      }
    };

    container.config.ready(applyInterval);
    container.message.on("config_updated", handleConfigUpdated);

    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, [page.boardUrl]);

  useEffect(() => {
    if (
      !isAutoRefreshEnabled ||
      !isActive ||
      !isDocumentVisible ||
      boardAutoRefreshIntervalMs < MIN_BOARD_AUTO_REFRESH_MS
    ) {
      return;
    }

    const timerId = viewWindow.setInterval(() => {
      if (loading) {
        return;
      }

      // タブを切り替えた瞬間に旧タブの更新が走ると体感が悪いため、
      // 一覧の自動更新は表示中タブの RELOAD 経路だけを使って発火する。
      dispatch(tabActions.reload());
    }, boardAutoRefreshIntervalMs);

    return () => {
      viewWindow.clearInterval(timerId);
    };
  }, [
    boardAutoRefreshIntervalMs,
    dispatch,
    isActive,
    isAutoRefreshEnabled,
    isDocumentVisible,
    loading,
    viewWindow,
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

  const handleSort = useCallback((column: ThreadListSortColumn) => {
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
    // 変更理由: ブックマークは一覧取得とは別に更新されるため、revision を明示的に
    // 参照して、このメモ化結果だけを再計算すれば星表示を同期できるようにする。
    void bookmarkRevision;
    const now = Date.now();
    let list = threads.map((t, i) => ({
      thread: t,
      originalIndex: i + 1,
      isBookmarked: readBookmarkStatus(t.url),
      unreadCount: getThreadUnreadCount(t),
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
  }, [bookmarkRevision, threads, sortColumn, sortDirection, searchQuery]);

  const handleThreadClick = useCallback(
    ({ thread }: DisplayThread) => {
      dispatch(tabActions.navigate({ type: "thread", title: thread.title, threadUrl: thread.url }));
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
      if (viewWindow.getSelection()?.toString()) {
        return;
      }

      dispatch(tabActions.reload());
    },
    [dispatch, viewWindow],
  );

  const openThreadInNewTab = useCallback(
    ({ thread }: DisplayThread) => {
      // ミドルクリックはバックグラウンドで開く（設定に関わらず常にバックグラウンドタブ）
      dispatch(
        tabActions.openInNewTab(
          { type: "thread", title: thread.title, threadUrl: thread.url },
          { background: true },
        ),
      );
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
    // ブックマークの外部更新でもメニューの表示を取り直すため、revisionを依存値に含める。
    void bookmarkRevision;
    return createThreadContextMenuItems({
      target: { title: thread.title, url: thread.url },
      isBookmarked: readBookmarkStatus(thread.url),
      onRegisterTitleNg: () => openThreadTitleNgDialog(thread),
      runCommand: runTargetCommand,
    });
  }, [bookmarkRevision, contextMenuState, openThreadTitleNgDialog, runTargetCommand]);

  const closeContextMenu = useCallback(() => setContextMenuState(null), []);
  const contextMenuNavigationActions = contextMenuState ? (
    <ContextMenuNavigationActions
      canGoBack={canGoBack(navigationTab)}
      canGoForward={canGoForward(navigationTab)}
      canRefresh={isPageRefreshable(page)}
      onBack={() => {
        dispatch(tabActions.goBack());
        closeContextMenu();
      }}
      onForward={() => {
        dispatch(tabActions.goForward());
        closeContextMenu();
      }}
      onRefresh={() => {
        dispatch(tabActions.reload());
        closeContextMenu();
      }}
    />
  ) : null;

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

  useEffect(() => {
    // 変更理由: 一覧の検索・NG適用後に実際に見えているスレ数を示し、
    // ステータスバーの件数と画面上の一覧件数を一致させる。
    setPageCount(pageCountKey, {
      kind: "threadList",
      count: loading && threads.length === 0 ? null : visibleDisplayThreads.length,
    });
    return () => setPageCount(pageCountKey, null);
  }, [loading, pageCountKey, setPageCount, threads.length, visibleDisplayThreads.length]);

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
      <WheelScrollIndicator
        {...wheelPagination}
        threshold={WHEEL_THRESHOLD}
        portalContainerRef={effectiveScrollContainerRef}
      />
      {error && <div className="thread-list-page__notice">{error}</div>}
      <SimpleDataTable
        columns={THREAD_LIST_COLUMNS}
        rows={visibleDisplayThreads}
        sections={threadSections}
        getRowKey={({ thread }) => thread.url}
        getRowTooltip={({ thread }) => thread.title}
        getRowClassName={({ thread }) => {
          const classes: string[] = [];
          if (isThreadVisited(thread)) classes.push("thread-list__row--visited");
          if (thread.demoted && !isNgTemporarilyDisabled) classes.push("thread-list__row--ng");
          if (thread.highlight) classes.push("thread-list__row--highlight");
          return classes.join(" ") || undefined;
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
          header={contextMenuNavigationActions}
          onClose={closeContextMenu}
        />
      )}
      <ThreadTitleNgDialog controller={threadTitleNgDialog} />
    </ThreadListView>
  );
};
