import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { container } from "src/service-container";
import { BookmarkListPage } from "src/view/browser/pages/BookmarkListPage";
import { QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE } from "src/view/browser/utils/filter-toolbar-events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mockUseTabStore = vi.fn();
const { copyTextMock, dispatchMock, removeBookmarkMock } = vi.hoisted(() => ({
  copyTextMock: vi.fn<() => Promise<void>>(),
  dispatchMock: vi.fn(),
  removeBookmarkMock: vi.fn<(url: string) => Promise<boolean>>(),
}));

vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/view/browser/utils/clipboard")>();
  return { ...actual, copyText: copyTextMock };
});

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => mockUseTabStore(),
  // useTabDispatch は dispatch のみを返す安定した関数。ページのフル状態購読回避後もdispatchが使える。
  useTabDispatch: () => dispatchMock,
  useTabViewState: () => ({ state: {}, update: vi.fn() }),
}));

interface BookmarkService {
  getAll?: () => unknown[];
  getAllThreads?: () => unknown[];
  promiseFirstScan?: Promise<boolean>;
}

describe("BookmarkListPage", () => {
  const getAllBookmarks = vi.fn<() => unknown[]>();
  let bookmarkUpdatedHandler: (() => void) | null = null;

  beforeEach(() => {
    mockUseTabStore.mockReset();
    getAllBookmarks.mockReset();
    copyTextMock.mockReset();
    copyTextMock.mockResolvedValue();
    dispatchMock.mockReset();
    removeBookmarkMock.mockReset();
    removeBookmarkMock.mockResolvedValue(true);
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

    (window as unknown as { app?: { bookmark?: BookmarkService } }).app = {
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
    container.config = {
      get: vi.fn(() => "on"),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.bookmark = {
      get: vi.fn(),
      add: vi.fn(),
      remove: removeBookmarkMock,
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("お気に入り行の右クリックメニューから現在タブと新しいタブで開ける", async () => {
    const url = "https://egg.5ch.io/test/read.cgi/software/1/";
    getAllBookmarks.mockReturnValue([{ url, title: "Current Thread" }]);

    render(<BookmarkListPage tabId="tab-1" isActive={true} />);

    const titleCell = await screen.findByText("Current Thread");
    const row = titleCell.closest("tr");
    expect(row).not.toBeNull();

    fireEvent.contextMenu(row!);
    fireEvent.click(screen.getByRole("button", { name: "現在のタブで開く" }));

    expect(dispatchMock).toHaveBeenLastCalledWith({
      type: "NAVIGATE",
      page: {
        type: "thread",
        title: "Current Thread",
        threadUrl: url,
      },
    });

    fireEvent.contextMenu(row!);
    fireEvent.click(screen.getByRole("button", { name: "新しいタブで開く" }));

    expect(dispatchMock).toHaveBeenLastCalledWith({
      type: "OPEN_IN_NEW_TAB",
      page: {
        type: "thread",
        title: "Current Thread",
        threadUrl: url,
      },
    });
  });

  it("お気に入り行の右クリックメニューから対象を削除できる", async () => {
    const url = "https://egg.5ch.io/test/read.cgi/software/1/";
    getAllBookmarks.mockReturnValue([{ url, title: "Current Thread" }]);

    render(<BookmarkListPage tabId="tab-1" isActive={true} />);

    const titleCell = await screen.findByText("Current Thread");
    const row = titleCell.closest("tr");
    expect(row).not.toBeNull();

    fireEvent.contextMenu(row!);
    fireEvent.click(screen.getByRole("button", { name: "ブックマークを削除" }));

    await waitFor(() => expect(removeBookmarkMock).toHaveBeenCalledWith(url));
    await waitFor(() => expect(screen.queryByText("Current Thread")).not.toBeInTheDocument());
  });

  it("お気に入り行の右クリックメニューからタイトルとURLをコピーできる", async () => {
    const url = "https://egg.5ch.io/test/read.cgi/software/1/";
    getAllBookmarks.mockReturnValue([{ url, title: "Current Thread" }]);

    render(<BookmarkListPage tabId="tab-1" isActive={true} />);

    const titleCell = await screen.findByText("Current Thread");
    const row = titleCell.closest("tr");
    expect(row).not.toBeNull();

    fireEvent.contextMenu(row!);
    fireEvent.click(screen.getByRole("button", { name: "タイトル&URLをコピー" }));
    expect(copyTextMock).toHaveBeenLastCalledWith(`Current Thread\n${url}`);

    fireEvent.contextMenu(row!);
    fireEvent.click(screen.getByRole("button", { name: "タイトル&URLをMarkdownでコピー" }));
    expect(copyTextMock).toHaveBeenLastCalledWith(`[Current Thread](${url})`);
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

    render(<BookmarkListPage tabId="tab-1" isActive={true} />);

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

    render(<BookmarkListPage tabId="tab-1" isActive={true} />);

    await screen.findByText("Current Thread");
    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.bookmarkList, {
          detail: { tabId: "tab-1" },
        }),
      );
    });

    const input = screen.getByPlaceholderText("検索...");
    fireEvent.change(input, { target: { value: "Thread" } });
    fireEvent.click(screen.getByRole("button", { name: "✕" }));

    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.bookmarkList, {
          detail: { tabId: "tab-1" },
        }),
      );
    });

    expect(screen.getByPlaceholderText("検索...")).toHaveValue("");
  });

  it("bookmark_updated を受けたら一覧を再読込する", async () => {
    getAllBookmarks.mockReturnValueOnce([]).mockReturnValueOnce([
      {
        url: "https://egg.5ch.io/test/read.cgi/software/1/",
        title: "Current Thread",
      },
    ]);

    render(<BookmarkListPage tabId="tab-1" isActive={true} />);

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

    (window as unknown as { app?: { bookmark?: BookmarkService } }).app = {
      bookmark: {
        getAll: getAllBookmarks,
        promiseFirstScan: readyPromise,
      },
    };

    render(<BookmarkListPage tabId="tab-1" isActive={true} />);

    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
    expect(getAllBookmarks).not.toHaveBeenCalled();

    resolveReady!(true);

    expect(await screen.findByText("Current Thread")).toBeInTheDocument();
    expect(getAllBookmarks).toHaveBeenCalledTimes(1);
  });
});
