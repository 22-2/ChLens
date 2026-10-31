import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { createOpenedBoards } from "src/core/board/OpenedBoards";
import { container as serviceContainer } from "src/service-container/index";
import type {
  IBoardService,
  IBoardTitleService,
  IBookmark,
  IHistoryService,
  IThread,
  IThreadLogService,
  IToastService,
} from "src/service-container/interfaces";
import { stubService } from "src/service-container/test-stubs";
import {
  askBoardTitle,
  bookmarkGetMock,
  cacheGetMock,
  cachePutMock,
  clearBookmarkReadStateMock,
  deleteLogMock,
  dispatchMock,
  focusedPaneIdRef,
  panesRef,
  removeHistoryMock,
  removeReadStateMock,
  selectedTabIdRef,
  toastErrorMock,
  toastInfoMock,
  toastSuccessMock,
  updateViewStateMock,
  viewStateRef,
} from "src/test-support/thread-list-page-mocks";
import { afterEach, beforeEach, vi } from "vite-plus/test";

export const THREAD_LIST_SORT_STORAGE_KEY = "chlens_browser_thread_list_sort_by_site";

export const THREADS: IThread[] = [
  {
    url: "https://egg.5ch.net/test/read.cgi/software/1/",
    title: "B Thread",
    resCount: 20,
    createdAt: 1,
    readState: {
      url: "https://egg.5ch.net/test/read.cgi/software/1/",
      read: 14,
      received: 20,
      last: 14,
    },
  },
  {
    url: "https://egg.5ch.net/test/read.cgi/software/2/",
    title: "A Thread",
    resCount: 5,
    createdAt: 2,
    readState: {
      url: "https://egg.5ch.net/test/read.cgi/software/2/",
      read: 5,
      received: 5,
      last: 5,
    },
  },
  {
    url: "https://egg.5ch.net/test/read.cgi/software/3/",
    title: "C Thread",
    resCount: 12,
    createdAt: 3,
    readState: {
      url: "https://egg.5ch.net/test/read.cgi/software/3/",
      read: 3,
      received: 12,
      last: 3,
    },
  },
];

function createMemoryStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(items.keys())[index] ?? null;
    },
    removeItem(key: string) {
      items.delete(key);
    },
    setItem(key: string, value: string) {
      items.set(key, value);
    },
  };
}

export function getRenderedThreadTitles(): string[] {
  return Array.from(document.querySelectorAll(".thread-list__title")).map(
    (node) => node.textContent?.trim() ?? "",
  );
}

export async function flushAsyncRender(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export interface ThreadListPageTestState {
  getThreadsMock: ReturnType<typeof vi.fn>;
  readonly messageListeners: Map<string, Set<(payload: never) => void>>;
}

/** 一覧ページのテストが共通に使う前提（板・タブ・キャッシュ・通信のモック）をそろえる。 */
export function setupThreadListPageTest(): ThreadListPageTestState {
  const configUpdatedListeners = new Set<(payload: { key?: string }) => void>();
  const messageListeners = new Map<string, Set<(payload: never) => void>>();
  const pageState: ThreadListPageTestState = { getThreadsMock: vi.fn(), messageListeners };

  beforeEach(() => {
    cacheGetMock.mockReset();
    cacheGetMock.mockResolvedValue(undefined);
    cachePutMock.mockReset();
    vi.useFakeTimers();
    dispatchMock.mockReset();
    viewStateRef.current = {};
    updateViewStateMock.mockReset();
    const askBoardTitleMock = vi.mocked(askBoardTitle);
    askBoardTitleMock.mockReset();
    askBoardTitleMock.mockResolvedValue(null);
    selectedTabIdRef.current = "tab-1";
    focusedPaneIdRef.current = "pane-1";
    panesRef.current = [];
    const localStorageMock = createMemoryStorage();
    vi.stubGlobal("localStorage", localStorageMock);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
    window.localStorage.removeItem(THREAD_LIST_SORT_STORAGE_KEY);
    pageState.getThreadsMock = vi.fn(async () => ({
      threads: THREADS,
      message: null,
    }));
    serviceContainer.board = {
      getThreads: pageState.getThreadsMock,
      getCachedResCount: vi.fn(),
    } as unknown as IBoardService;
    bookmarkGetMock.mockReset();
    bookmarkGetMock.mockReturnValue(undefined);
    clearBookmarkReadStateMock.mockReset();
    clearBookmarkReadStateMock.mockResolvedValue(true);
    serviceContainer.bookmark = {
      // 初回の走査の完了はサービスコンテナで待つ（legacy-window-app-plan の Phase 2）。
      ready: vi.fn(async () => undefined),
      get: bookmarkGetMock,
      add: vi.fn(),
      remove: vi.fn(),
      clearReadState: clearBookmarkReadStateMock,
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(() => []),
    } as unknown as IBookmark;
    deleteLogMock.mockReset();
    deleteLogMock.mockResolvedValue(1);
    removeReadStateMock.mockReset();
    removeReadStateMock.mockImplementation(async (url: string) => {
      for (const handler of messageListeners.get("read_state_removed") ?? []) {
        handler({ url } as never);
      }
    });
    serviceContainer.readState = {
      remove: removeReadStateMock,
    } as unknown as typeof serviceContainer.readState;
    removeHistoryMock.mockReset();
    removeHistoryMock.mockResolvedValue(undefined);
    serviceContainer.threadLog = {
      deleteLog: deleteLogMock,
    } as unknown as IThreadLogService;
    serviceContainer.history = {
      remove: removeHistoryMock,
    } as unknown as IHistoryService;
    toastErrorMock.mockReset();
    toastInfoMock.mockReset();
    toastSuccessMock.mockReset();
    serviceContainer.toast = {
      notify: vi.fn(),
      error: toastErrorMock,
      info: toastInfoMock,
      success: toastSuccessMock,
    } as IToastService;
    serviceContainer.util = {
      isNewerReadState: (a: unknown, b: unknown) =>
        (b as { received?: number }).received !== (a as { received?: number }).received,
    } as unknown as typeof serviceContainer.util;
    serviceContainer.config = {
      get: vi.fn((key: string) => (key === "auto_load_second_board" ? "10000" : "0")),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    // ジェネリックな実サービスに対し、このテストで扱うconfig更新イベントだけに限定する。
    serviceContainer.boardTitle = stubService<IBoardTitleService>("boardTitle", {
      ask: askBoardTitle,
    });
    // 開いた板の保存は、テストごとに差し替える config をそのまま読む本物の実装で確かめる。
    serviceContainer.openedBoards = createOpenedBoards(serviceContainer);
    serviceContainer.message = {
      send: vi.fn(),
      on: vi.fn((type: string, handler: (payload: { key?: string }) => void) => {
        if (type === "config_updated") {
          configUpdatedListeners.add(handler);
        }
        if (!messageListeners.has(type)) {
          messageListeners.set(type, new Set());
        }
        messageListeners.get(type)?.add(handler as (payload: never) => void);
      }),
      off: vi.fn((type: string, handler: (payload: { key?: string }) => void) => {
        if (type === "config_updated") {
          configUpdatedListeners.delete(handler);
        }
        messageListeners.get(type)?.delete(handler as (payload: never) => void);
      }),
    } as unknown as typeof serviceContainer.message;
  });

  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(THREAD_LIST_SORT_STORAGE_KEY);
    vi.unstubAllGlobals();
    configUpdatedListeners.clear();
    messageListeners.clear();
    vi.useRealTimers();
  });

  return pageState;
}
