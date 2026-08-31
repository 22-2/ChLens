import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { container } from "src/service-container";
import { NavigationBar } from "src/view/browser/components/NavigationBar";
import type { Page } from "src/view/browser/types";
import { QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE } from "src/view/browser/utils/filter-toolbar-events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { activeTab, defaultHistory, dispatchMock, longTitle } = vi.hoisted(() => {
  const longTitle = "かなり長い履歴タイトル".repeat(12);
  const defaultHistory = [
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
  const activeTab = {
    id: "tab-1",
    history: [...defaultHistory] as Page[],
    currentIndex: 1,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  };

  return {
    activeTab,
    defaultHistory,
    dispatchMock: vi.fn(),
    longTitle,
  };
});

const { bookmarkGetAllThreadsMock, historyGetMock } = vi.hoisted(() => ({
  bookmarkGetAllThreadsMock: vi.fn(),
  historyGetMock: vi.fn(),
}));

const { bookmarkGetMock, bookmarkAddMock, bookmarkRemoveMock, toastInfoMock, toastErrorMock } =
  vi.hoisted(() => ({
    bookmarkGetMock: vi.fn(),
    bookmarkAddMock: vi.fn(),
    bookmarkRemoveMock: vi.fn(),
    toastInfoMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));

let bookmarkUpdatedHandler: ((payload?: { bookmark?: { url?: string } }) => void) | null = null;
let bookmarkedUrls = new Set<string>();

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    state: { tabs: [activeTab] },
    activeTab,
    currentPage: activeTab.history[activeTab.currentIndex],
    dispatch: dispatchMock,
    paneId: "pane-1",
  }),
  // NavigationBar は複数ペイン時のみ「ペインを閉じる」を出すため、単一ペインを返す。
  useTabPanes: () => ({ panes: [{ id: "pane-1" }], activePaneId: "pane-1" }),
}));

vi.mock("src/view/browser/hooks/use-bottom-panel", () => ({
  useBottomPanel: () => ({
    isOpen: false,
    togglePanel: vi.fn(),
  }),
}));

describe("NavigationBar", () => {
  beforeEach(() => {
    bookmarkedUrls = new Set<string>();
    bookmarkUpdatedHandler = null;

    bookmarkGetMock.mockImplementation((url: string) =>
      bookmarkedUrls.has(url)
        ? {
            url,
            title: url,
            type: url.includes("/test/read.cgi/") ? "thread" : "board",
          }
        : undefined,
    );
    bookmarkAddMock.mockImplementation(
      (item: { url: string; title: string; type: "thread" | "board" }) => {
        bookmarkedUrls.add(item.url);
        bookmarkUpdatedHandler?.({ bookmark: { url: item.url } });
      },
    );
    bookmarkRemoveMock.mockImplementation((url: string) => {
      bookmarkedUrls.delete(url);
      bookmarkUpdatedHandler?.({ bookmark: { url } });
    });

    container.bookmark = {
      get: bookmarkGetMock,
      add: bookmarkAddMock,
      remove: bookmarkRemoveMock,
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
    };
    container.message = {
      send: vi.fn(),
      on: (type, callback) => {
        if (type === "bookmark_updated") {
          bookmarkUpdatedHandler = callback as typeof bookmarkUpdatedHandler;
        }
      },
      off: (type, callback) => {
        if (type === "bookmark_updated" && bookmarkUpdatedHandler === callback) {
          bookmarkUpdatedHandler = null;
        }
      },
    };
    container.toast = {
      notify: vi.fn(),
      success: vi.fn(),
      error: toastErrorMock,
      info: toastInfoMock,
    };
  });

  afterEach(() => {
    cleanup();
    dispatchMock.mockReset();
    bookmarkGetAllThreadsMock.mockReset();
    historyGetMock.mockReset();
    bookmarkGetMock.mockReset();
    bookmarkAddMock.mockReset();
    bookmarkRemoveMock.mockReset();
    toastInfoMock.mockReset();
    toastErrorMock.mockReset();
    bookmarkUpdatedHandler = null;
    bookmarkedUrls = new Set<string>();
    // テストでは必要なレガシーAPIだけを差し替えるため、実アプリのwindow.app型から切り離す。
    const mutableWindow = window as unknown as {
      app?: unknown;
    };
    delete mutableWindow.app;
    activeTab.history = [...defaultHistory];
    activeTab.currentIndex = 1;
  });

  it("URLバー候補は『タイトル URL』の並びで表示し、お気に入りを優先する", async () => {
    bookmarkGetAllThreadsMock.mockReturnValue([
      {
        url: "https://egg.5ch.io/test/read.cgi/software/111/",
        title: "openai bookmark",
      },
    ]);
    historyGetMock.mockResolvedValue([
      {
        url: "https://egg.5ch.io/test/read.cgi/software/222/",
        // 最短一致の優先度を揃え、お気に入りの加点だけで並び順を検証する。
        title: "openai archived",
        viewedDate: 1000000001000,
      },
    ]);

    // テストでは必要なレガシーAPIだけを差し替えるため、実アプリのwindow.app型から切り離す。
    const mutableWindow = window as unknown as {
      app?: unknown;
    };
    mutableWindow.app = {
      bookmark: {
        getAllThreads: bookmarkGetAllThreadsMock,
      },
      History: {
        get: historyGetMock,
      },
    };

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("URLバーを表示"));
    const input = screen.getByPlaceholderText("URLを入力");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "openai" } });

    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("openai bookmark");
    expect(options[0]).toHaveTextContent("https://egg.5ch.io/test/read.cgi/software/111/");
  });

  it("URL欄から別板のスレを開くと、その板を戻る先として履歴に積む", () => {
    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("URLバーを表示"));
    const input = screen.getByPlaceholderText("URLを入力");
    fireEvent.change(input, {
      target: { value: "https://egg.5ch.io/test/read.cgi/board-b/123/" },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(dispatchMock).toHaveBeenNthCalledWith(1, {
      type: "NAVIGATE",
      page: {
        type: "threadList",
        title: "https://egg.5ch.io/board-b/",
        boardUrl: "https://egg.5ch.io/board-b/",
        boardTitle: "https://egg.5ch.io/board-b/",
      },
    });
    expect(dispatchMock).toHaveBeenNthCalledWith(2, {
      type: "NAVIGATE",
      page: {
        type: "thread",
        title: "https://egg.5ch.io/test/read.cgi/board-b/123/",
        threadUrl: "https://egg.5ch.io/test/read.cgi/board-b/123/",
      },
    });
  });

  it("URLバーを折りたたみボタンで表示・非表示に切り替える", () => {
    render(<NavigationBar />);

    const expandButton = screen.getByTitle("URLバーを表示");
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByPlaceholderText("URLを入力")).not.toBeInTheDocument();

    fireEvent.click(expandButton);

    const collapseButton = screen.getByTitle("URLバーを折りたたむ");
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    const input = screen.getByPlaceholderText("URLを入力");
    expect(input).toBeInTheDocument();
    expect(input.closest(".nav-bar__url-row")).toBeInTheDocument();

    fireEvent.click(collapseButton);
    expect(screen.queryByPlaceholderText("URLを入力")).not.toBeInTheDocument();
  });

  it("URLバー右端にも現在ページのブックマーク操作を表示する", async () => {
    render(<NavigationBar />);

    expect(
      screen.queryByRole("button", { name: "このページをブックマークに追加" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("URLバーを表示"));
    const bookmarkButton = screen.getByRole("button", {
      name: "このページをブックマークに追加",
    });

    expect(bookmarkButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(bookmarkButton);

    await waitFor(() => {
      expect(bookmarkAddMock).toHaveBeenCalledWith({
        url: "https://egg.5ch.net/test/read.cgi/software/1/",
        title: "Current Thread",
        type: "thread",
      });
    });

    // URLバー側に複製しても、既存のメニュー操作は引き続き表示する。
    fireEvent.click(screen.getByTitle("メニュー"));
    expect(
      screen.getByRole("button", {
        name: "お気に入りから削除",
      }),
    ).toBeInTheDocument();
  });

  it("設定ボタンをメニューのアイコン操作列に表示する", () => {
    render(<NavigationBar />);

    expect(screen.queryByRole("button", { name: "設定を開く" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("メニュー"));

    const settingsButton = screen.getByRole("button", { name: "設定を開く" });
    expect(settingsButton).toHaveClass("nav-bar__menu-action");

    fireEvent.click(settingsButton);

    expect(dispatchMock).toHaveBeenNthCalledWith(1, { type: "ADD_TAB" });
    expect(dispatchMock).toHaveBeenNthCalledWith(2, {
      type: "NAVIGATE",
      page: { type: "settings", title: "設定" },
    });
  });

  it("2ペイン切替をタイトルバーへ移し、ナビゲーションバーには表示しない", () => {
    render(<NavigationBar />);

    const buttons = [...document.querySelectorAll(".nav-bar > button")].map((button) =>
      button.getAttribute("title"),
    );

    expect(buttons).toEqual(["URLバーを表示", "メニュー"]);
    expect(screen.queryByTitle("2ペインで表示")).not.toBeInTheDocument();
  });

  it("頻繁なナビゲーション操作をハンバーガーメニューの最上段に表示する", () => {
    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));

    const actions = screen.getByRole("group", { name: "ナビゲーション操作" });
    expect(actions).toBeInTheDocument();
    expect(within(actions).getByTitle("戻る")).toBeInTheDocument();
    expect(within(actions).getByTitle("進む")).toBeInTheDocument();
    expect(within(actions).getByTitle("更新")).toBeInTheDocument();
    expect(within(actions).getByTitle("お気に入りに追加")).toBeInTheDocument();
  });

  it("戻る履歴メニューのタイトルを複数行表示にする", () => {
    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.contextMenu(screen.getByTitle("戻る"));

    const item = screen.getByRole("button", { name: longTitle });
    const label = document.querySelector(".context-menu__label--multiline") as HTMLSpanElement;

    expect(item).toHaveClass("context-menu__item--multiline");
    expect(label).toHaveTextContent(longTitle);
  });

  it("メニューを開いている間に同じボタンを押すと閉じる", () => {
    render(<NavigationBar />);

    const menuButton = screen.getByTitle("メニュー");

    fireEvent.click(menuButton);
    expect(screen.getByRole("button", { name: "コマンドパレット" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "設定を開く" })).toBeInTheDocument();

    // mousedown で先に close してしまうと click トグルで再オープンするため、
    // トリガー上の mousedown は無視して click 側で閉じることを保証する。
    fireEvent.mouseDown(menuButton);
    fireEvent.click(menuButton);

    expect(screen.queryByRole("button", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "設定を開く" })).not.toBeInTheDocument();
  });

  it("メニュー項目の『フィルターを開く』でフィルタトグルイベントを送る", () => {
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "フィルター" }));

    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "thread-filter-toolbar-toggle" }),
    );
    dispatchEventSpy.mockRestore();
  });

  it("閲覧履歴ではメニュー項目の『フィルターを開く』で履歴用トグルイベントを送る", () => {
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
    activeTab.history = [
      {
        type: "historyList" as const,
        title: "閲覧履歴",
      },
    ];
    activeTab.currentIndex = 0;

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "フィルター" }));

    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.historyList,
        detail: { tabId: "tab-1" },
      }),
    );
    dispatchEventSpy.mockRestore();
  });

  it("板一覧ではメニュー項目の『フィルターを開く』で板一覧用トグルイベントを送る", () => {
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
    activeTab.history = [
      {
        type: "boardList" as const,
        title: "板一覧",
      },
    ];
    activeTab.currentIndex = 0;

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "フィルター" }));

    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.boardList,
        detail: { tabId: "tab-1" },
      }),
    );
    dispatchEventSpy.mockRestore();
  });

  it("ブックマークリストではメニュー項目の『フィルターを開く』でブックマーク用トグルイベントを送る", () => {
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
    activeTab.history = [
      {
        type: "bookmarkList" as const,
        title: "ブックマークリスト",
      },
    ];
    activeTab.currentIndex = 0;

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "フィルター" }));

    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.bookmarkList,
        detail: { tabId: "tab-1" },
      }),
    );
    dispatchEventSpy.mockRestore();
  });

  it("メニュー上部のお気に入りで現在スレッドのブックマークを切り替える", async () => {
    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    const starButton = screen.getByRole("button", {
      name: "お気に入りに追加",
    });

    expect(starButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(starButton);

    await waitFor(() => {
      expect(bookmarkAddMock).toHaveBeenCalledWith({
        url: "https://egg.5ch.net/test/read.cgi/software/1/",
        title: "Current Thread",
        type: "thread",
      });
    });
    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith("ブックマークに追加しました");
    });
    fireEvent.click(screen.getByTitle("メニュー"));
    expect(
      screen.getByRole("button", {
        name: "お気に入りから削除",
      }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(
      screen.getByRole("button", {
        name: "お気に入りから削除",
      }),
    );

    await waitFor(() => {
      expect(bookmarkRemoveMock).toHaveBeenCalledWith(
        "https://egg.5ch.net/test/read.cgi/software/1/",
      );
    });
    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith("ブックマークを削除しました");
    });
  });

  it("板一覧ページでもメニュー上部のお気に入りから板をブックマークできる", async () => {
    activeTab.history = [
      {
        type: "threadList",
        title: "Software",
        boardUrl: "https://egg.5ch.net/software/",
        boardTitle: "Software",
      },
    ];
    activeTab.currentIndex = 0;

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "お気に入りに追加",
      }),
    );

    await waitFor(() => {
      expect(bookmarkAddMock).toHaveBeenCalledWith({
        url: "https://egg.5ch.net/software/",
        title: "Software",
        type: "board",
      });
    });
  });

  it("bookmark反映が遅れても同期失敗toastを出さず、後から星状態が揃う", async () => {
    bookmarkAddMock.mockImplementation(
      async (item: { url: string; title: string; type: "thread" | "board" }) => {
        setTimeout(() => {
          bookmarkedUrls.add(item.url);
          bookmarkUpdatedHandler?.({ bookmark: { url: item.url } });
        }, 0);
      },
    );

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "お気に入りに追加",
      }),
    );

    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith("ブックマークに追加しました");
    });
    expect(toastErrorMock).not.toHaveBeenCalledWith("ブックマーク状態の同期に失敗しました");

    fireEvent.click(screen.getByTitle("メニュー"));
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "お気に入りから削除",
        }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });
});
