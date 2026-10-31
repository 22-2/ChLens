import { vi } from "vite-plus/test";

// 一覧ページのテストで共通に使うモックの状態。
// この手前のモジュールは他のプロジェクトのモジュールを import しないため、vi.mock の工場関数から安全に読める。
export const loggerMock = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
export const dispatchMock = vi.fn();
export const selectedTabIdRef = { current: "tab-1" };
export const viewStateRef: {
  current: { searchQuery?: string; sortColumn?: string | null; sortDirection?: "asc" | "desc" };
} = { current: {} };
export const updateViewStateMock = vi.fn();
export const focusedPaneIdRef = { current: "pane-1" };
export const panesRef: { current: unknown[] } = { current: [] };
export const cacheGetMock = vi.fn();
export const cachePutMock = vi.fn();
export const bookmarkGetMock = vi.fn();
export const deleteLogMock = vi.fn();
export const removeReadStateMock = vi.fn();
export const clearBookmarkReadStateMock = vi.fn();
export const removeHistoryMock = vi.fn();
export const toastErrorMock = vi.fn();
export const toastInfoMock = vi.fn();
export const toastSuccessMock = vi.fn();
export const askBoardTitle = vi.fn(async (_url: unknown): Promise<string | null> => null);

export function createLoggerModule() {
  return { createLogger: () => loggerMock };
}

/** 実在の板の一覧に依存せず、一覧の表示を検証するため、キャッシュの読み書きだけを差し替える。 */
export function createThreadListSharedModule(
  actual: typeof import("src/features/thread-list/ui/thread-list-shared"),
) {
  return {
    ...actual,
    // UIキャッシュの検証をページ表示の責務へ限定し、拡張機能APIを読み込まずに試す。
    getThreadListCache: cacheGetMock,
    setThreadListCache: cachePutMock,
  };
}

export function createBoardUrlNormalizerModule(
  actual: typeof import("src/core/board/BoardUrlNormalizer"),
) {
  // 実在の板へ依存せず、予約済みドメインで板を開いた記録を検証する。
  return {
    ...actual,
    normalizeBoardUrl: (url: string, options?: Parameters<typeof actual.normalizeBoardUrl>[1]) =>
      actual.normalizeBoardUrl(url, url.includes("example.com") ? {} : options),
    getBoardUrlKey: (url: string, options?: Parameters<typeof actual.getBoardUrlKey>[1]) =>
      actual.getBoardUrlKey(url, url.includes("example.com") ? {} : options),
  };
}

export function createUseTabStoreModule() {
  return {
    useTabStore: () => ({
      dispatch: dispatchMock,
      state: { selectedTabId: selectedTabIdRef.current },
      stateRef: {
        get current() {
          return {
            panes: [
              {
                id: "pane-1",
                tabs: [
                  {
                    id: selectedTabIdRef.current,
                    history: [
                      { type: "boardList", title: "ホーム" },
                      {
                        type: "threadList",
                        title: "Software",
                        boardUrl: "https://egg.5ch.net/software/",
                        boardTitle: "Software",
                      },
                      { type: "settings", title: "設定" },
                    ],
                    currentIndex: 1,
                    pinned: false,
                    reloadKey: 0,
                    autoRefreshEnabled: false,
                    autoRefreshPageKey: null,
                  },
                ],
                activeTabId: selectedTabIdRef.current,
              },
            ],
            activePaneId: "pane-1",
            closedTabs: [],
          };
        },
      },
      viewTab: {
        id: selectedTabIdRef.current,
        history: [
          { type: "boardList", title: "ホーム" },
          {
            type: "threadList",
            title: "Software",
            boardUrl: "https://egg.5ch.net/software/",
            boardTitle: "Software",
          },
          { type: "settings", title: "設定" },
        ],
        currentIndex: 1,
        pinned: false,
        reloadKey: 0,
        autoRefreshEnabled: false,
        autoRefreshPageKey: null,
      },
    }),
    useTabDispatch: () => dispatchMock,
    useTabDispatchForTab: () => dispatchMock,
    useTabViewState: () => ({ state: viewStateRef.current, update: updateViewStateMock }),
    usePaneId: () => "pane-1",
    useActivePaneId: () => focusedPaneIdRef.current,
    useTabPanes: () => ({ panes: panesRef.current }),
  };
}
