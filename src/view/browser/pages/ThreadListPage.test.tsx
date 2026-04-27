import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { container as serviceContainer } from "src/service-container/index";
import type { IBoardService, IThread } from "src/service-container/interfaces";
import { ThreadListPage } from "src/view/browser/pages/ThreadListPage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const THREAD_LIST_SORT_STORAGE_KEY = "readcrx_browser_thread_list_sort_by_site";
const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn() }));

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
  useTabStore: () => ({ dispatch: dispatchMock }),
}));

const THREADS: IThread[] = [
  {
    url: "https://egg.5ch.net/test/read.cgi/software/1/",
    title: "B Thread",
    resCount: 20,
    createdAt: 1,
  },
  {
    url: "https://egg.5ch.net/test/read.cgi/software/2/",
    title: "A Thread",
    resCount: 5,
    createdAt: 2,
  },
  {
    url: "https://egg.5ch.net/test/read.cgi/software/3/",
    title: "C Thread",
    resCount: 12,
    createdAt: 3,
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
  return Array.from(document.querySelectorAll(".thread-list tbody .thread-list__title")).map(
    (node) => node.textContent?.trim() ?? "",
  );
}

describe("ThreadListPage", () => {
  let getThreadsMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dispatchMock.mockReset();
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
  });

  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(THREAD_LIST_SORT_STORAGE_KEY);
    vi.unstubAllGlobals();
  });

  it("同じsiteでは保存したソート順を復元し、別siteには持ち込まない", async () => {
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
});
