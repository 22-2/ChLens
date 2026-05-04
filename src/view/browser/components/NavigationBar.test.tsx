import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NavigationBar } from "src/view/browser/components/NavigationBar";
import { QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE } from "src/view/browser/utils/filter-toolbar-events";
import { afterEach, describe, expect, it, vi } from "vitest";

const { activeTab, defaultHistory, dispatchMock, longTitle } = vi.hoisted(
  () => {
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
      history: [...defaultHistory],
      currentIndex: 1,
      pinned: false,
      reloadKey: 0,
      autoRefreshEnabled: false,
      autoRefreshThreadUrl: null,
    };

    return {
      activeTab,
      defaultHistory,
      dispatchMock: vi.fn(),
      longTitle,
    };
  },
);

const { bookmarkGetAllThreadsMock, historyGetMock } = vi.hoisted(() => ({
  bookmarkGetAllThreadsMock: vi.fn(),
  historyGetMock: vi.fn(),
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    state: { tabs: [activeTab] },
    activeTab,
    currentPage: activeTab.history[activeTab.currentIndex],
    dispatch: dispatchMock,
  }),
}));

vi.mock("src/view/browser/hooks/use-bottom-panel", () => ({
  useBottomPanel: () => ({
    isOpen: false,
    togglePanel: vi.fn(),
  }),
}));

describe("NavigationBar", () => {
  afterEach(() => {
    cleanup();
    dispatchMock.mockReset();
    bookmarkGetAllThreadsMock.mockReset();
    historyGetMock.mockReset();
    const mutableWindow = window as Window & typeof globalThis & {
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
        title: "openai history",
        viewedDate: 1000000001000,
      },
    ]);

    const mutableWindow = window as Window & typeof globalThis & {
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

    const input = screen.getByPlaceholderText("URLを入力");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "openai" } });

    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("openai bookmark");
    expect(options[0]).toHaveTextContent(
      "https://egg.5ch.io/test/read.cgi/software/111/",
    );
  });

  it("戻る履歴メニューのタイトルを複数行表示にする", () => {
    render(<NavigationBar />);

    fireEvent.contextMenu(screen.getByTitle("戻る"));

    const item = screen.getByRole("button", { name: longTitle });
    const label = document.querySelector(
      ".context-menu__label--multiline",
    ) as HTMLSpanElement;

    expect(item).toHaveClass("context-menu__item--multiline");
    expect(label).toHaveTextContent(longTitle);
  });

  it("メニューを開いている間に同じボタンを押すと閉じる", () => {
    render(<NavigationBar />);

    const menuButton = screen.getByTitle("メニュー");

    fireEvent.click(menuButton);
    expect(
      screen.getByRole("button", { name: "設定を開く" }),
    ).toBeInTheDocument();

    // mousedown で先に close してしまうと click トグルで再オープンするため、
    // トリガー上の mousedown は無視して click 側で閉じることを保証する。
    fireEvent.mouseDown(menuButton);
    fireEvent.click(menuButton);

    expect(
      screen.queryByRole("button", { name: "設定を開く" }),
    ).not.toBeInTheDocument();
  });

  it("メニュー項目の『フィルターを開く』でフィルタトグルイベントを送る", () => {
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "フィルターを開く" }));

    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "thread-filter-toolbar-toggle" }),
    );
    dispatchEventSpy.mockRestore();
  });

  it("閲覧履歴ではメニュー項目の『フィルターを開く』で履歴用トグルイベントを送る", () => {
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
    activeTab.history = [
      {
        type: "historyList",
        title: "閲覧履歴",
      },
    ];
    activeTab.currentIndex = 0;

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "フィルターを開く" }));

    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.historyList,
        detail: { tabId: "tab-1" },
      }),
    );
    dispatchEventSpy.mockRestore();
  });
});
