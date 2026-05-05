import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { container } from "src/service-container";
import { BookmarkListPage } from "src/view/browser/pages/BookmarkListPage";
import { QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE } from "src/view/browser/utils/filter-toolbar-events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseTabStore = vi.fn();

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => mockUseTabStore(),
}));

interface BookmarkService {
  getAll?: () => unknown[];
  getAllThreads?: () => unknown[];
  promiseFirstScan?: Promise<boolean>;
}

describe("BookmarkListPage", () => {
  const getAllBookmarks = vi.fn<BookmarkService["getAll"]>();
  let bookmarkUpdatedHandler: (() => void) | null = null;

  beforeEach(() => {
    mockUseTabStore.mockReset();
    getAllBookmarks.mockReset();
    bookmarkUpdatedHandler = null;

    mockUseTabStore.mockReturnValue({
      dispatch: vi.fn(),
      state: {
        tabs: [],
        activeTabId: "tab-1",
        closedTabs: [],
      },
      currentPage: {
        type: "bookmarkList",
        title: "ブックマークリスト",
      },
    });

    (
      window as Window & {
        app?: {
          bookmark?: BookmarkService;
        };
      }
    ).app = {
      bookmark: {
        getAll: getAllBookmarks,
      },
    };

    container.message = {
      send: vi.fn(),
      on: (type, callback) => {
        if (type === "bookmark_updated") {
          bookmarkUpdatedHandler = callback as () => void;
        }
      },
      off: (type, callback) => {
        if (type === "bookmark_updated" && bookmarkUpdatedHandler === callback) {
          bookmarkUpdatedHandler = null;
        }
      },
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("スレと板の両方のブックマークを一覧表示する", async () => {
    getAllBookmarks.mockReturnValue([
      {
        url: "https://egg.5ch.io/test/read.cgi/software/1/",
        title: "Current Thread",
        resCount: 120,
        readState: { read: 100 },
      },
      {
        url: "https://egg.5ch.io/software/",
        title: "Software",
      },
    ]);

    render(<BookmarkListPage tabId="tab-1" />);

    expect(await screen.findByText("Current Thread")).toBeInTheDocument();
    expect(screen.getByText("Software")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("ブックマークフィルターバーをメニューイベントで開閉できる", async () => {
    getAllBookmarks.mockReturnValue([
      {
        url: "https://egg.5ch.io/test/read.cgi/software/1/",
        title: "Current Thread",
      },
    ]);

    render(<BookmarkListPage tabId="tab-1" />);

    await screen.findByText("Current Thread");
    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(
          QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.bookmarkList,
          {
            detail: { tabId: "tab-1" },
          },
        ),
      );
    });

    const input = screen.getByPlaceholderText("検索...");
    fireEvent.change(input, { target: { value: "Thread" } });
    fireEvent.click(screen.getByRole("button", { name: "✕" }));

    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(
          QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.bookmarkList,
          {
            detail: { tabId: "tab-1" },
          },
        ),
      );
    });

    expect(screen.getByPlaceholderText("検索...")).toHaveValue("");
  });

  it("bookmark_updated を受けたら一覧を再読込する", async () => {
    getAllBookmarks
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        {
          url: "https://egg.5ch.io/test/read.cgi/software/1/",
          title: "Current Thread",
        },
      ]);

    render(<BookmarkListPage tabId="tab-1" />);

    expect(screen.queryByText("Current Thread")).not.toBeInTheDocument();

    act(() => {
      bookmarkUpdatedHandler?.();
    });

    expect(await screen.findByText("Current Thread")).toBeInTheDocument();
  });

  it("初回スキャン完了を待ってから既存ブックマークを表示する", async () => {
    let resolveReady: ((value: boolean) => void) | null = null;
    const readyPromise = new Promise<boolean>((resolve) => {
      resolveReady = resolve;
    });

    getAllBookmarks.mockReturnValue([
      {
        url: "https://egg.5ch.io/test/read.cgi/software/1/",
        title: "Current Thread",
      },
    ]);

    (
      window as Window & {
        app?: {
          bookmark?: BookmarkService;
        };
      }
    ).app = {
      bookmark: {
        getAll: getAllBookmarks,
        promiseFirstScan: readyPromise,
      },
    };

    render(<BookmarkListPage tabId="tab-1" />);

    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
    expect(getAllBookmarks).not.toHaveBeenCalled();

    resolveReady?.(true);

    expect(await screen.findByText("Current Thread")).toBeInTheDocument();
    expect(getAllBookmarks).toHaveBeenCalledTimes(1);
  });
});
