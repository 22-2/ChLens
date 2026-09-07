import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ask as askBoardTitle } from "src/core/BoardTitleSolver.js";
import { container as serviceContainer } from "src/service-container/index";
import type { IBoardService, IThread } from "src/service-container/interfaces";
import { ThreadListPage } from "src/view/browser/pages/ThreadListPage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const THREAD_LIST_SORT_STORAGE_KEY = "chlens_browser_thread_list_sort_by_site";
const { dispatchMock, activeTabIdRef, viewStateRef, updateViewStateMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  activeTabIdRef: { current: "tab-1" },
  viewStateRef: {
    current: {} as {
      searchQuery?: string;
      sortColumn?: string | null;
      sortDirection?: "asc" | "desc";
    },
  },
  updateViewStateMock: vi.fn(),
}));
const { focusedPaneIdRef, panesRef } = vi.hoisted(() => ({
  focusedPaneIdRef: { current: "pane-1" },
  panesRef: { current: [] as unknown[] },
}));
const { cacheGetMock, cachePutMock } = vi.hoisted(() => ({
  cacheGetMock: vi.fn(),
  cachePutMock: vi.fn(),
}));

vi.mock("src/app", () => ({
  platform: {
    storage: {
      // UIキャッシュの検証はページ表示の責務と分け、拡張機能APIを読まずに単体テストできるようにする。
      getStore: () => ({
        get: cacheGetMock,
        put: cachePutMock,
      }),
    },
  },
}));

vi.mock("src/core/BoardTitleSolver.js", () => ({
  ask: vi.fn(async () => null),
}));

vi.mock("src/core/URL", () => ({
  URL: class MockChURL {
    #url: URL;

    constructor(rawUrl: string) {
      this.#url = new window.URL(rawUrl);
    }

    getTsld(): string {
      const parts = this.#url.hostname.toLowerCase().split(".");
      return parts.length >= 2 ? parts.slice(-2).join(".") : this.#url.hostname.toLowerCase();
    }
  },
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    dispatch: dispatchMock,
    state: { activeTabId: activeTabIdRef.current },
  }),
  useTabDispatch: () => dispatchMock,
  useTabViewState: () => ({ state: viewStateRef.current, update: updateViewStateMock }),
  usePaneId: () => "pane-1",
  useActivePaneId: () => focusedPaneIdRef.current,
  useTabPanes: () => ({ panes: panesRef.current }),
}));

const THREADS: IThread[] = [
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

function getRenderedThreadTitles(): string[] {
  return Array.from(document.querySelectorAll(".thread-list__title")).map(
    (node) => node.textContent?.trim() ?? "",
  );
}

async function flushAsyncRender(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ThreadListPage", () => {
  let getThreadsMock: ReturnType<typeof vi.fn>;
  const configUpdatedListeners = new Set<(payload: { key?: string }) => void>();
  const messageListeners = new Map<string, Set<(payload: never) => void>>();

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
    activeTabIdRef.current = "tab-1";
    focusedPaneIdRef.current = "pane-1";
    panesRef.current = [];
    const localStorageMock = createMemoryStorage();
    vi.stubGlobal("localStorage", localStorageMock);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
    window.localStorage.removeItem(THREAD_LIST_SORT_STORAGE_KEY);
    getThreadsMock = vi.fn(async () => ({
      threads: THREADS,
      message: null,
    }));
    serviceContainer.board = {
      getThreads: getThreadsMock,
      getCachedResCount: vi.fn(),
    } as unknown as IBoardService;
    serviceContainer.util = {
      isNewerReadState: (a: unknown, b: unknown) =>
        (b as { received?: number }).received !== (a as { received?: number }).received,
    } as unknown as typeof serviceContainer.util;
    serviceContainer.config = {
      get: vi.fn((key: string) => (key === "auto_load_second_board" ? "20000" : "0")),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    // ジェネリックな実サービスに対し、このテストで扱うconfig更新イベントだけに限定する。
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

  it("一覧の自動更新は表示中タブでのみ発火する", async () => {
    const props = {
      tabId: "tab-1",
      page: {
        type: "threadList" as const,
        title: "Software",
        boardUrl: "https://egg.5ch.net/software/",
        boardTitle: "Software",
      },
      refreshKey: 0,
      isActive: true,
      isAutoRefreshEnabled: true,
    };

    const { rerender } = render(
      <ThreadListPage
        tabId={props.tabId}
        page={props.page}
        refreshKey={props.refreshKey}
        isActive={props.isActive}
        isAutoRefreshEnabled={props.isAutoRefreshEnabled}
      />,
    );

    await flushAsyncRender();
    expect(getThreadsMock).toHaveBeenCalledTimes(1);

    dispatchMock.mockClear();

    activeTabIdRef.current = "tab-2";
    rerender(
      <ThreadListPage
        tabId={props.tabId}
        page={props.page}
        refreshKey={props.refreshKey}
        isActive={false}
        isAutoRefreshEnabled={props.isAutoRefreshEnabled}
      />,
    );
    await vi.advanceTimersByTimeAsync(20000);
    expect(dispatchMock).not.toHaveBeenCalledWith({ type: "RELOAD" });

    activeTabIdRef.current = "tab-1";
    rerender(
      <ThreadListPage
        tabId={props.tabId}
        page={props.page}
        refreshKey={props.refreshKey}
        isActive={true}
        isAutoRefreshEnabled={props.isAutoRefreshEnabled}
      />,
    );
    await vi.advanceTimersByTimeAsync(20000);
    expect(dispatchMock).toHaveBeenCalledWith({ type: "RELOAD" });
  });

  it("非表示中の既読更新は保留し、表示復帰時に再取得なしで反映する", async () => {
    vi.useRealTimers();
    const page = {
      type: "threadList" as const,
      title: "Software",
      boardUrl: "https://egg.5ch.net/software/",
      boardTitle: "Software",
    };
    const { rerender } = render(
      <ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={false} />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toContain("B Thread");
    });
    const emit = (payload: unknown) => {
      for (const handler of messageListeners.get("read_state_updated") ?? []) {
        handler(payload as never);
      }
    };
    // 変更理由: 2ペイン時、スレ側の自動更新で既読位置が進むたび裏側の一覧まで
    // 書き換わっていた。非表示の間は適用せず、復帰時にまとめて反映する。
    emit({
      board_url: "https://egg.5ch.net/software/",
      read_state: {
        url: "https://egg.5ch.net/test/read.cgi/software/1/",
        read: 14,
        received: 25,
        last: 14,
      },
    });
    await flushAsyncRender();
    // 未読列は 20-14=6 のまま変わらない。
    expect(document.body.textContent).not.toContain("11");

    rerender(<ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={true} />);
    await waitFor(() => {
      // 未読列が 25-14=11 に更新される。再取得は走らない。
      expect(document.body.textContent).toContain("11");
    });
    expect(getThreadsMock).toHaveBeenCalledTimes(1);
  });

  it("自ペインの表タブでもフォーカス外なら既読更新を保留する", async () => {
    vi.useRealTimers();
    focusedPaneIdRef.current = "pane-2";
    const page = {
      type: "threadList" as const,
      title: "Software",
      boardUrl: "https://egg.5ch.net/software/",
      boardTitle: "Software",
    };
    const { rerender } = render(
      <ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={true} />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toContain("B Thread");
    });
    // 変更理由: 2ペインでスレ側を見ている間、裏ペインの一覧がスレの自動更新に
    // 連動して書き換わらないこと。フォーカスを戻すとまとめて反映される。
    for (const handler of messageListeners.get("read_state_updated") ?? []) {
      handler({
        board_url: "https://egg.5ch.net/software/",
        read_state: {
          url: "https://egg.5ch.net/test/read.cgi/software/1/",
          read: 14,
          received: 25,
          last: 14,
        },
      } as never);
    }
    await waitFor(() => {
      expect(getThreadsMock).toHaveBeenCalledTimes(1);
    });
    expect(document.body.textContent).not.toContain("11");

    focusedPaneIdRef.current = "pane-1";
    // フォーカス変化はストア経由のため再描画で取り込む。
    rerender(<ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={true} />);
    await waitFor(() => {
      expect(document.body.textContent).toContain("11");
    });
    expect(getThreadsMock).toHaveBeenCalledTimes(1);
  });

  it("別ペインのスレ自動更新による既読更新を一覧へ即時反映しない", async () => {
    vi.useRealTimers();
    focusedPaneIdRef.current = "pane-1";
    const threadUrl = THREADS[0].url;
    const boardUrl = new URL(threadUrl).origin + "/software/";
    panesRef.current = [
      {
        id: "pane-1",
        activeTabId: "list-tab",
        tabs: [
          {
            id: "list-tab",
            history: [
              {
                type: "threadList",
                title: "Software",
                boardUrl,
                boardTitle: "Software",
              },
            ],
            currentIndex: 0,
            pinned: false,
            reloadKey: 0,
            autoRefreshEnabled: false,
            autoRefreshPageKey: null,
          },
        ],
      },
      {
        id: "pane-2",
        activeTabId: "thread-tab",
        tabs: [
          {
            id: "thread-tab",
            history: [
              {
                type: "thread",
                title: "スレッド",
                threadUrl,
              },
            ],
            currentIndex: 0,
            pinned: false,
            reloadKey: 0,
            autoRefreshEnabled: true,
            autoRefreshPageKey: `thread:${threadUrl}`,
          },
        ],
      },
    ];
    const page = {
      type: "threadList" as const,
      title: "Software",
      boardUrl,
      boardTitle: "Software",
    };
    const { rerender } = render(
      <ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={true} />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toContain("B Thread");
    });
    for (const handler of messageListeners.get("read_state_updated") ?? []) {
      handler({
        board_url: boardUrl,
        read_state: {
          url: threadUrl,
          read: 14,
          received: 25,
          last: 14,
        },
      } as never);
    }

    await flushAsyncRender();
    expect(document.body.textContent).not.toContain("11");

    // スレ側の次回更新で一覧コンポーネントが再描画されても、
    // 自動更新中の通知は引き続き保留する。
    panesRef.current = [...panesRef.current];
    rerender(<ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={true} />);
    await flushAsyncRender();
    expect(document.body.textContent).not.toContain("11");

    panesRef.current = [
      {
        id: "pane-1",
        activeTabId: "list-tab",
        tabs: [
          {
            id: "list-tab",
            history: [page],
            currentIndex: 0,
            pinned: false,
            reloadKey: 0,
            autoRefreshEnabled: false,
            autoRefreshPageKey: null,
          },
        ],
      },
    ];
    // スレの自動更新が終わると、保留していた既読状態だけを一覧へ反映する。
    rerender(<ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={true} />);
    await waitFor(() => {
      expect(document.body.textContent).toContain("11");
    });
    expect(getThreadsMock).toHaveBeenCalledTimes(1);
  });

  it("スレ一覧のフィルタを板ごとに復元し、保存更新で入力中の値を巻き戻さない", async () => {
    vi.useRealTimers();
    viewStateRef.current = { searchQuery: "A Thread" };

    const softwarePage = {
      type: "threadList" as const,
      title: "Software",
      boardUrl: "https://egg.5ch.net/software/",
      boardTitle: "Software",
    };
    const { rerender } = render(
      <ThreadListPage tabId="tab-1" page={softwarePage} refreshKey={0} isActive={true} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("A Thread");
    });

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "B Thread" } });
    expect(updateViewStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ searchQuery: "B Thread" }),
    );

    // タブストアの再描画が入力イベントより先に届いても、同じ板の入力値は維持する。
    viewStateRef.current = { searchQuery: "" };
    rerender(<ThreadListPage tabId="tab-1" page={softwarePage} refreshKey={0} isActive={true} />);
    expect(screen.getByRole("textbox")).toHaveValue("B Thread");

    // 板を切り替えたときだけ、切り替え先の板に保存された値を復元する。
    viewStateRef.current = { searchQuery: "C Thread" };
    rerender(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "News",
          boardUrl: "https://egg.5ch.net/news/",
          boardTitle: "News",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("C Thread");
    });
  });

  it("同じsiteでは保存したソート順を復元し、別siteには持ち込まない", async () => {
    vi.useRealTimers();

    const { rerender } = render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread", "C Thread"]);
    });

    fireEvent.click(screen.getByRole("columnheader", { name: /レス/ }));

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["A Thread", "C Thread", "B Thread"]);
    });

    rerender(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "VIP",
          boardUrl: "https://itest.5ch.net/news4vip/",
          boardTitle: "VIP",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getThreadsMock).toHaveBeenCalledTimes(2);
      expect(getRenderedThreadTitles()).toEqual(["A Thread", "C Thread", "B Thread"]);
    });

    rerender(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Open2ch",
          boardUrl: "https://hayabusa.open2ch.net/livejupiter/",
          boardTitle: "Open2ch",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getThreadsMock).toHaveBeenCalledTimes(3);
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread", "C Thread"]);
    });
  });

  it("一覧データがある場合はresult.messageをエラー表示しない", async () => {
    vi.useRealTimers();

    getThreadsMock.mockResolvedValueOnce({
      threads: THREADS,
      message: "板の読み込みに失敗しました",
    });

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread", "C Thread"]);
    });

    expect(screen.queryByText("板の読み込みに失敗しました")).toBeNull();
  });

  it("未読数列を表示して未読数でソートできる", async () => {
    vi.useRealTimers();

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /未読/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("columnheader", { name: /未読/ }));

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["A Thread", "B Thread", "C Thread"]);
    });

    fireEvent.click(screen.getByRole("columnheader", { name: /未読/ }));

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["C Thread", "B Thread", "A Thread"]);
    });
  });

  it("板URLが変わったらタイトル解決を再実行する", async () => {
    vi.useRealTimers();

    const askBoardTitleMock = vi.mocked(askBoardTitle);
    askBoardTitleMock.mockResolvedValueOnce("Software");
    askBoardTitleMock.mockResolvedValueOnce("News");

    const { rerender } = render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "https://egg.5ch.net/software/",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "https://egg.5ch.net/software/",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: "UPDATE_TITLE_FOR_TAB",
        tabId: "tab-1",
        title: "Software",
        boardUrl: "https://egg.5ch.net/software/",
      });
    });

    rerender(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "https://egg.5ch.net/news/",
          boardUrl: "https://egg.5ch.net/news/",
          boardTitle: "https://egg.5ch.net/news/",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: "UPDATE_TITLE_FOR_TAB",
        tabId: "tab-1",
        title: "News",
        boardUrl: "https://egg.5ch.net/news/",
      });
    });

    expect(askBoardTitleMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      boardUrl: "http://bbs.eddibb.cc/liveedge/",
      placeholderTitle: "bbs.eddibb.cc/liveedge",
      resolvedTitle: "エッヂ",
    },
    {
      boardUrl: "https://tulip-garden.net/garden/",
      placeholderTitle: "tulip-garden.net/garden",
      resolvedTitle: "チューリップ庭園",
    },
  ])(
    "URL由来の仮タイトルでは板名再解決をスキップしない: $boardUrl",
    async ({ boardUrl, placeholderTitle, resolvedTitle }) => {
      vi.useRealTimers();

      const askBoardTitleMock = vi.mocked(askBoardTitle);
      askBoardTitleMock.mockResolvedValueOnce(resolvedTitle);

      render(
        <ThreadListPage
          tabId="tab-1"
          page={{
            type: "threadList",
            title: boardUrl,
            boardUrl,
            boardTitle: placeholderTitle,
          }}
          refreshKey={0}
          isActive={true}
        />,
      );

      await waitFor(() => {
        expect(dispatchMock).toHaveBeenCalledWith({
          type: "UPDATE_TITLE_FOR_TAB",
          tabId: "tab-1",
          title: resolvedTitle,
          boardUrl,
        });
      });

      expect(askBoardTitleMock).toHaveBeenCalledTimes(1);
    },
  );

  it("既に解決済みの title があるときは URL由来 boardTitle で上書きしない", async () => {
    vi.useRealTimers();

    const askBoardTitleMock = vi.mocked(askBoardTitle);

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "チューリップ庭園",
          boardUrl: "https://tulip-garden.net/garden/",
          boardTitle: "tulip-garden.net/garden",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      // oxlint-disable-next-line unbound-method
      expect(serviceContainer.board.getThreads).toHaveBeenCalled();
    });

    expect(askBoardTitleMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalledWith({
      type: "UPDATE_TITLE_FOR_TAB",
      tabId: "tab-1",
      title: "tulip-garden.net/garden",
    });
  });
});
