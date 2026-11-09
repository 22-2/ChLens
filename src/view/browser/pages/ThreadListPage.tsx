import React, { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import {
  BOARD_AUTO_REFRESH_CONFIG_KEY,
  MIN_BOARD_AUTO_REFRESH_MS,
  readBoardAutoRefreshIntervalMs,
} from "src/features/auto-refresh/browser/auto-refresh-config";
import {
  readBookmarkStatus,
  useBookmarkRevision,
} from "src/features/bookmark/browser/use-bookmark-revision";
import { useNgStatus } from "src/features/ng/browser/use-ng-status";
import { useThreadTitleNgDialog } from "src/features/ng/browser/use-thread-title-ng-dialog";
import { ThreadTitleNgDialog } from "src/features/ng/ui/ThreadTitleNgDialog";
import { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import { useTabViewRuntime } from "src/features/tabs/browser/use-tab-view-runtime";
import {
  useWheelPagination,
  WHEEL_THRESHOLD,
} from "src/features/thread/browser/useWheelPagination";
import { createThreadContextMenuItems } from "src/features/thread/ui/thread-context-menu-items";
import { WheelScrollIndicator } from "src/features/thread/ui/WheelScrollIndicator";
import { clearCachedThreadReadState } from "src/features/thread-list/ui/thread-list-cache";
import { setThreadListLoadedAt } from "src/features/thread-list/ui/thread-list-loaded-at";
import {
  calcHeat,
  createHighlightDividerStyle,
  type DisplayThread,
  getThreadListCache,
  isSortColumn,
  isSortDirection,
  readThreadListSortPreference,
  setThreadListCache,
  THREAD_LIST_COLUMN_ORDER_STORAGE_KEY,
  THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS,
  THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY,
  THREAD_LIST_COLUMNS,
  type ThreadListSortColumn,
  writeThreadListSortPreference,
} from "src/features/thread-list/ui/thread-list-shared";
import {
  getThreadListSnapshots,
  selectThreadListSnapshot,
  type ThreadListSnapshot,
  useSelectedThreadListSnapshot,
} from "src/features/thread-list/ui/thread-list-snapshots";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import type { CommandRequest } from "src/view/browser/commands/command-runtime";
import { runCommandRequest } from "src/view/browser/commands/command-runtime";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { deleteThreadLogAndHistory } from "src/view/browser/commands/thread-log-actions";
import { ContextMenuNavigationActions } from "src/view/browser/components/ContextMenuNavigationActions";
import { OperationStatusItem } from "src/view/browser/components/OperationStatusItem";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { SimpleDataTable } from "src/view/browser/components/SimpleDataTable";
import {
  getThreadListPageCountKey,
  usePageCountStatus,
} from "src/view/browser/hooks/use-page-count-status";
import {
  buildDisplayThreads,
  buildThreadSections,
  countThreadListFlags,
  filterVisibleThreads,
  getThreadRowClassName,
  nextSortPreference,
} from "src/view/browser/pages/thread-list/thread-list-display";
import { useThreadListBoardRecord } from "src/view/browser/pages/thread-list/use-thread-list-board-record";
import { useThreadListData } from "src/view/browser/pages/thread-list/use-thread-list-data";
import { useThreadListReadStateSync } from "src/view/browser/pages/thread-list/use-thread-list-read-state-sync";
import { useThreadListViewState } from "src/view/browser/pages/thread-list/use-thread-list-view-state";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import {
  canGoBack,
  canGoForward,
  type Tab,
  type ThreadListPage as ThreadListPageType,
} from "src/view/browser/types";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { Spinner } from "src/view/browser/ui/Spinner";
import {
  setFilterToolbarOpen,
  setFilterToolbarPinned,
} from "src/view/browser/utils/filter-toolbar-open-state";
import { getManualRefreshScopeKey, runManualRefresh } from "src/view/browser/utils/manual-refresh";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";
import { SCOPED_SETTINGS_CONFIG_KEY } from "src/view/browser/utils/scoped-settings";
import { ThreadListView } from "src/view/shared/ThreadListView";

const logger = createLogger("view/browser");

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
} from "src/features/thread-list/ui/thread-list-shared";

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
  const fallbackScrollContainerRef = useRef<HTMLDivElement>(null);
  const effectiveScrollContainerRef = scrollContainerRef ?? fallbackScrollContainerRef;
  const runTargetCommand = useCallback(
    (request: CommandRequest) => {
      void runCommandRequest(request, { surface: viewSurface, toast });
    },
    [toast, viewSurface],
  );
  const { viewTab } = useTabStore();
  const { visitedBoardRef, resolvedBoardTitlesRef } = useThreadListBoardRecord({
    tabId,
    page,
    isActive,
    dispatch,
  });
  const runTabCommand = useTabCommandRunner(tabId);
  const manualRefreshScopeKey = getManualRefreshScopeKey(tabId, page);
  const requestManualRefresh = useCallback(
    () => runManualRefresh(manualRefreshScopeKey, () => runTabCommand(TAB_COMMAND_IDS.RELOAD)),
    [manualRefreshScopeKey, runTabCommand],
  );
  // 既存の直接利用者との互換性のため渡されたtabを残し、通常の描画経路ではそれを優先する。
  const navigationTab = tab ?? viewTab;
  const {
    sortPreference,
    setSortPreference,
    searchQuery,
    setSearchQuery,
    searchOptions,
    setSearchOptions,
  } = useThreadListViewState(tabId, page);
  const { isNgTemporarilyDisabled, setThreadListStats } = useNgStatus();
  const { setPageCount } = usePageCountStatus();
  const pageCountKey = getThreadListPageCountKey(tabId, page.boardUrl);
  const bookmarkRevision = useBookmarkRevision();
  const [snapshots, setSnapshots] = useState<ThreadListSnapshot[]>([]);
  const selectedSnapshot = useSelectedThreadListSnapshot(tabId);
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const onSnapshotSaved = useCallback(() => setSnapshotRevision((revision) => revision + 1), []);
  const autoRefreshRequestRef = useRef<{ boardUrl: string; refreshKey: number } | null>(null);
  const {
    threads: liveThreads,
    setThreads,
    loading,
    isAutoRefreshing,
    showRefreshOverlay,
    error,
    fetchThreads,
    lastLoadedAt,
  } = useThreadListData({
    boardUrl: page.boardUrl,
    refreshKey,
    manualRefreshScopeKey,
    autoRefreshRequestRef,
    onSnapshotSaved,
    visitedBoardRef,
    resolvedBoardTitlesRef,
  });
  const threads = selectedSnapshot?.threads ?? liveThreads;
  // 過去の履歴を表示中は、その一覧を読み込んだ時刻を出す。
  const loadedAt = selectedSnapshot?.last_updated ?? lastLoadedAt;
  useEffect(() => {
    // ステータスバーの最終読み込み表示へ渡し、ページを離れたら消す。
    setThreadListLoadedAt(tabId, loadedAt);
    return () => setThreadListLoadedAt(tabId, null);
  }, [loadedAt, tabId]);
  useEffect(() => {
    let cancelled = false;
    void getThreadListSnapshots(page.boardUrl)
      .then((entries) => {
        if (!cancelled) setSnapshots(entries);
      })
      .catch((error: unknown) => {
        logger.error("スレ一覧のスナップショットを読み込めませんでした:", error);
        if (!cancelled) toast.error("スレ一覧の履歴を読み込めませんでした");
      });
    return () => {
      cancelled = true;
    };
  }, [page.boardUrl, snapshotRevision, toast]);
  useEffect(() => {
    // 板の切り替えや明示的な更新後は、保存済みの過去一覧から最新表示に戻す。
    selectThreadListSnapshot(tabId, null);
    return () => selectThreadListSnapshot(tabId, null);
  }, [page.boardUrl, refreshKey, tabId]);
  useThreadListReadStateSync({ boardUrl: page.boardUrl, isActive, setThreads });
  const [boardAutoRefreshIntervalMs, setBoardAutoRefreshIntervalMs] = useState(() =>
    readBoardAutoRefreshIntervalMs(page.boardUrl),
  );
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    viewDocument.visibilityState === "visible",
  );
  // 変更理由: 更新開始後のloading中もwheel更新の共有cooldownとindicatorを維持し、
  // 画面切替で別の一覧/スレッドから連続更新できる隙間を作らない。
  const wheelPagination = useWheelPagination({
    isEnabled: isActive,
    isLoading: loading,
    cooldownScopeKey: manualRefreshScopeKey,
    containerRef: effectiveScrollContainerRef,
    edge: "top",
    onRefresh: requestManualRefresh,
  });
  // 変更理由: スレ一覧ではフィルタバーを常設するため、開閉の状態は持たない。
  // 通知の上端位置を合わせ、タイトルバーの開閉ボタンを隠せるよう、開いている・常時表示として共有する。
  useEffect(() => {
    setFilterToolbarOpen(tabId, true);
    setFilterToolbarPinned(tabId, true);
    return () => {
      setFilterToolbarOpen(tabId, false);
      setFilterToolbarPinned(tabId, false);
    };
  }, [tabId]);
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
      selectedSnapshot != null ||
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
      // 同じRELOAD経路を使う手動更新と区別し、自動更新だけ進捗をステータスバーへ出す。
      autoRefreshRequestRef.current = { boardUrl: page.boardUrl, refreshKey };
      if (!runTabCommand(TAB_COMMAND_IDS.RELOAD)) autoRefreshRequestRef.current = null;
    }, boardAutoRefreshIntervalMs);

    return () => {
      viewWindow.clearInterval(timerId);
    };
  }, [
    boardAutoRefreshIntervalMs,
    isActive,
    isAutoRefreshEnabled,
    isDocumentVisible,
    loading,
    page.boardUrl,
    refreshKey,
    selectedSnapshot,
    runTabCommand,
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

  const handleSort = useCallback(
    (column: ThreadListSortColumn) => {
      setSortPreference((previous) => nextSortPreference(previous, column));
    },
    [setSortPreference],
  );

  // ソート・検索フィルタ適用後のスレッド一覧
  const displayThreads = useMemo(() => {
    // 変更理由: ブックマークは一覧取得とは別に更新されるため、revision を明示的に
    // 参照して、このメモ化結果だけを再計算すれば星表示を同期できるようにする。
    void bookmarkRevision;
    return buildDisplayThreads({
      threads,
      now: selectedSnapshot?.last_updated ?? Date.now(),
      searchQuery,
      searchOptions,
      sort: sortPreference,
      isBookmarked: readBookmarkStatus,
    });
  }, [bookmarkRevision, threads, sortPreference, searchOptions, searchQuery, selectedSnapshot]);

  const handleThreadClick = useCallback(
    ({ thread }: DisplayThread) => {
      dispatch(tabActions.navigate({ type: "thread", title: thread.title, threadUrl: thread.url }));
    },
    [dispatch],
  );

  // 空白部分のダブルクリックによる更新。
  // 設定項目は持たず常に有効にする。誤操作防止のためリンクやテキスト選択中などは除外する。
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      // リンク、ボタン、入力系要素などは除外
      if (target.closest("a, button, input, textarea")) {
        return;
      }

      // テキスト選択中はリロードしない
      if (viewWindow.getSelection()?.toString()) {
        return;
      }

      requestManualRefresh();
    },
    [requestManualRefresh, viewWindow],
  );

  const openThreadInNewTab = useCallback(
    ({ thread }: DisplayThread) => {
      // ミドルクリックの新規スレは設定に関わらず背景で開き、既存スレの選択はTabStoreに任せる。
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

  const deleteThreadRecords = useCallback(
    async (thread: IThread) => {
      try {
        const deletedCount = await deleteThreadLogAndHistory(
          thread.url,
          clearCachedThreadReadState,
        );
        if (deletedCount === 0) {
          toast.info("このスレのログは保存されていません。閲覧履歴を削除しました", {
            targetWindow: viewWindow,
          });
          return;
        }
        toast.success("スレログと閲覧履歴を削除しました", { targetWindow: viewWindow });
      } catch (error) {
        logger.error("スレログと閲覧履歴の削除に失敗しました", { url: thread.url, error });
        toast.error("スレログと閲覧履歴を削除できませんでした", { targetWindow: viewWindow });
      }
    },
    [toast, viewWindow],
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
      onDeleteThreadRecords: () => {
        void deleteThreadRecords(thread);
      },
    });
  }, [
    bookmarkRevision,
    contextMenuState,
    deleteThreadRecords,
    openThreadTitleNgDialog,
    runTargetCommand,
  ]);

  const closeContextMenu = useCallback(() => setContextMenuState(null), []);
  const contextMenuNavigationActions = contextMenuState ? (
    <ContextMenuNavigationActions
      canGoBack={canGoBack(navigationTab)}
      canGoForward={canGoForward(navigationTab)}
      canRefresh={isPageRefreshable(page)}
      onBack={() => {
        runTabCommand(TAB_COMMAND_IDS.BACK);
        closeContextMenu();
      }}
      onForward={() => {
        runTabCommand(TAB_COMMAND_IDS.FORWARD);
        closeContextMenu();
      }}
      onRefresh={() => {
        requestManualRefresh();
        closeContextMenu();
      }}
    />
  ) : null;

  const { ngCount: threadListNgCount, highlightCount: threadListHighlightCount } = useMemo(
    () => countThreadListFlags(threads),
    [threads],
  );
  const visibleDisplayThreads = useMemo(
    () => filterVisibleThreads(displayThreads, isNgTemporarilyDisabled),
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

  const threadSections = useMemo(
    () => buildThreadSections(visibleDisplayThreads, isNgTemporarilyDisabled),
    [isNgTemporarilyDisabled, visibleDisplayThreads],
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
  // 変更理由: IDBキャッシュや前回の一覧が見えている間は一覧を残し、取得結果で差し替える。
  // 一覧が空のときだけ読み込み表示にして、ロード中に画面全体を隠さないようにする。
  if (loading && threads.length === 0 && !isAutoRefreshing) {
    return (
      <div className="page-status">
        <Spinner size="sm" aria-label="スレ一覧を読み込み中" />
        <span>読み込み中...</span>
      </div>
    );
  }

  // 通信に失敗しても履歴があれば、過去の一覧を選択できる状態を残す。
  if (error && threads.length === 0 && snapshots.length === 0) {
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
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          searchOptions={searchOptions}
          onSearchOptionsChange={setSearchOptions}
          hitCount={visibleDisplayThreads.length}
          autoFocus={false}
        />
      }
      onDoubleClick={handleDoubleClick}
    >
      <OperationStatusItem
        id={`thread-list-fetch-status-${tabId}`}
        message={loading && isAutoRefreshing ? "スレ一覧を読み込み中..." : null}
        busy={loading && isAutoRefreshing}
        visible={isActive}
      />
      <WheelScrollIndicator
        {...wheelPagination}
        threshold={WHEEL_THRESHOLD}
        portalContainerRef={effectiveScrollContainerRef}
      />
      {showRefreshOverlay && (
        <div
          className={`thread-list-page__loading-overlay${loading ? " thread-list-page__loading-overlay--visible" : ""}`}
          role="status"
          aria-live="polite"
        >
          <Spinner size="sm" aria-label="スレ一覧を読み込み中" />
          <span>スレ一覧を読み込み中...</span>
        </div>
      )}
      {error && <div className="thread-list-page__notice">{error}</div>}
      <SimpleDataTable
        columns={THREAD_LIST_COLUMNS}
        rows={visibleDisplayThreads}
        highlightQuery={searchQuery}
        sections={threadSections}
        getRowKey={({ thread }) => thread.url}
        getRowTooltip={({ thread }) => thread.title}
        getRowClassName={({ thread }) => getThreadRowClassName(thread, isNgTemporarilyDisabled)}
        onRowClick={handleThreadClick}
        onRowMiddleClick={openThreadInNewTab}
        onRowContextMenu={({ thread }, x, y) => setContextMenuState({ x, y, thread })}
        sortColumn={sortColumn ?? undefined}
        sortDirection={sortDirection}
        onSort={handleTableSort}
        columnVisibilityStorageKey={THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY}
        columnVisibilityLockedKeys={THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS}
        columnOrderStorageKey={THREAD_LIST_COLUMN_ORDER_STORAGE_KEY}
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
