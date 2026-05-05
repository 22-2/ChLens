import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ask as askBoardTitle } from "src/core/BoardTitleSolver.js";
import { container as serviceContainer } from "src/service-container/index";
import type { IBoardService, IThread } from "src/service-container/interfaces";
import { ThreadListPage } from "src/view/browser/pages/ThreadListPage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const THREAD_LIST_SORT_STORAGE_KEY = "readcrx_browser_thread_list_sort_by_site";
const { dispatchMock, activeTabIdRef } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  activeTabIdRef: { current: "tab-1" },
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
      return parts.length >= 2
        ? parts.slice(-2).join(".")
        : this.#url.hostname.toLowerCase();
    }
  },
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    dispatch: dispatchMock,
    state: { activeTabId: activeTabIdRef.current },
  }),
  useTabDispatch: () => dispatchMock,
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

  beforeEach(() => {
    vi.useFakeTimers();
    dispatchMock.mockReset();
    const askBoardTitleMock = vi.mocked(askBoardTitle);
    askBoardTitleMock.mockReset();
    askBoardTitleMock.mockResolvedValue(null);
    activeTabIdRef.current = "tab-1";
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
    serviceContainer.config = {
      get: vi.fn((key: string) =>
        key === "auto_load_second_board" ? "20000" : "0",
      ),
      set: vi.fn(),
      ready: (callback: () => void) => callback(),
    };
    serviceContainer.message = {
      send: vi.fn(),
      on: vi.fn(
        (type: string, handler: (payload: { key?: string }) => void) => {
          if (type === "config_updated") {
            configUpdatedListeners.add(handler);
          }
        },
      ),
      off: vi.fn(
        (type: string, handler: (payload: { key?: string }) => void) => {
          if (type === "config_updated") {
            configUpdatedListeners.delete(handler);
          }
        },
      ),
    };
  });

  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(THREAD_LIST_SORT_STORAGE_KEY);
    vi.unstubAllGlobals();
    configUpdatedListeners.clear();
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
    };

    const { rerender } = render(
      <ThreadListPage
        tabId={props.tabId}
        page={props.page}
        refreshKey={props.refreshKey}
        isActive={props.isActive}
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
      />,
    );
    await vi.advanceTimersByTimeAsync(20000);
    expect(dispatchMock).toHaveBeenCalledWith({ type: "RELOAD" });
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
      expect(getRenderedThreadTitles()).toEqual([
        "B Thread",
        "A Thread",
        "C Thread",
      ]);
    });

    fireEvent.click(screen.getByRole("columnheader", { name: /レス/ }));

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual([
        "A Thread",
        "C Thread",
        "B Thread",
      ]);
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
      expect(getRenderedThreadTitles()).toEqual([
        "A Thread",
        "C Thread",
        "B Thread",
      ]);
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
      expect(getRenderedThreadTitles()).toEqual([
        "B Thread",
        "A Thread",
        "C Thread",
      ]);
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
      expect(getRenderedThreadTitles()).toEqual([
        "B Thread",
        "A Thread",
        "C Thread",
      ]);
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
      expect(
        screen.getByRole("columnheader", { name: /未読/ }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("columnheader", { name: /未読/ }));

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual([
        "A Thread",
        "B Thread",
        "C Thread",
      ]);
    });

    fireEvent.click(screen.getByRole("columnheader", { name: /未読/ }));

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual([
        "C Thread",
        "B Thread",
        "A Thread",
      ]);
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
