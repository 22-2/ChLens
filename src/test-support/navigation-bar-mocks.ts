import type { Page } from "src/view/browser/types";
import { vi } from "vite-plus/test";

// NavigationBar のテストで共通に使うモックの状態。
// この手前のモジュールは他のプロジェクトのモジュールを import しないため、vi.mock の工場関数から安全に読める。

// browser-commands は拡張機能向け依存を含むため、DOM単体テストではAPIモジュールを差し替える。
export const requestThreadResJumpMock = vi.fn();
export const loadRecentCommandIdsMock = vi.fn(async () => [] as string[]);
export const saveRecentCommandIdsMock = vi.fn(async () => undefined);

export const longTitle = "かなり長い履歴タイトル".repeat(12);
export const defaultHistory = [
  {
    type: "threadList" as const,
    title: longTitle,
    boardUrl: "https://egg.5ch.net/software/",
    boardTitle: "Software",
  },
  {
    type: "thread" as const,
    title: "Current Thread",
    threadUrl: "https://egg.5ch.net/test/read.cgi/software/1/",
  },
];
export const viewTab = {
  id: "tab-1",
  history: [...defaultHistory] as Page[],
  currentIndex: 1,
  pinned: false,
  reloadKey: 0,
  autoRefreshEnabled: false,
  autoRefreshPageKey: null,
};
export const dispatchMock = vi.fn();

export const bookmarkGetAllMock = vi.fn();
export const historyGetMock = vi.fn();

export const bookmarkGetMock = vi.fn();
export const bookmarkAddMock = vi.fn();
export const bookmarkRemoveMock = vi.fn();
export const toastInfoMock = vi.fn();
export const toastErrorMock = vi.fn();

// お気に入りの更新通知と、登録済みの URL の集合は、テストごとに作り直すため入れ物で持つ。
export type BookmarkUpdatedHandler = (payload?: { bookmark?: { url?: string } }) => void;
export const bookmarkState: { updatedHandler: BookmarkUpdatedHandler | null; urls: Set<string> } = {
  updatedHandler: null,
  urls: new Set<string>(),
};

export const paneHolder = { panes: [{ id: "pane-1" }], activePaneId: "pane-1" };
export const orientationHolder = { value: "horizontal" };

export function createThreadReadStateModule() {
  return {
    requestThreadResJump: requestThreadResJumpMock,
  };
}

export function createCommandPaletteHistoryModule() {
  return {
    loadRecentCommandIds: loadRecentCommandIdsMock,
    saveRecentCommandIds: saveRecentCommandIdsMock,
  };
}

export function createTabStoreModule() {
  return {
    useTabStore: () => ({
      state: { tabs: [viewTab], closedTabs: [] },
      stateRef: {
        current: {
          panes: [{ id: "pane-1", tabs: [viewTab], activeTabId: viewTab.id }],
          activePaneId: "pane-1",
          closedTabs: [],
        },
      },
      viewTab,
      viewPage: viewTab.history[viewTab.currentIndex],
      dispatch: dispatchMock,
      paneId: "pane-1",
    }),
    // NavigationBar は複数ペイン時のみ「ペインを閉じる」を出すため、単一ペインを返す。
    useTabPanes: () => ({ panes: paneHolder.panes, activePaneId: paneHolder.activePaneId }),
  };
}

export function createTabBarOrientationModule() {
  return {
    // 変更理由: タブバー方向は設定由来のため、テストでは方向指定で描画先を切り替える。
    useTabBarOrientation: () => orientationHolder.value,
  };
}

export function createBottomPanelModule() {
  return {
    BOTTOM_PANEL_THREAD_LIST_TAB_ID: "thread-list",
    BOTTOM_PANEL_WRITE_TAB_ID: "write",
    useBottomPanel: () => ({
      isOpen: false,
      togglePanel: vi.fn(),
    }),
  };
}
