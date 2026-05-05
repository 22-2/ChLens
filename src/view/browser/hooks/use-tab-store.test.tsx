import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/app/platform", () => ({
  // use-tab-store はタイトル更新以外で platform を使わないため、
  // 拡張機能専用 polyfill を読み込まずに reducer の振る舞い検証へ集中する。
  platform: {
    window: {
      setTitle: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

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

describe("TabProvider auto refresh state", () => {
  beforeEach(() => {
    const localStorageMock = createMemoryStorage();
    vi.stubGlobal("localStorage", localStorageMock);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
    localStorage.removeItem("readcrx_browser_session");
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("現在のスレッドURLにだけ自動更新を束縛する", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } =
      await import("src/view/browser/hooks/use-tab-store");

    function Harness() {
      const { activeTab, currentPage, dispatch } = useTabStore();
      const isCurrentThreadAutoRefreshEnabled =
        currentPage.type === "thread" &&
        activeTab.autoRefreshEnabled &&
        activeTab.autoRefreshThreadUrl === currentPage.threadUrl;

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-1",
                  threadUrl: "https://example.com/test/read.cgi/foo/1/",
                },
              })
            }
          >
            thread-1 へ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "SET_AUTO_REFRESH_ENABLED",
                enabled: true,
                threadUrl: "https://example.com/test/read.cgi/foo/1/",
              })
            }
          >
            thread-1 で自動更新ON
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-2",
                  threadUrl: "https://example.com/test/read.cgi/foo/2/",
                },
              })
            }
          >
            thread-2 へ移動
          </button>
          <output data-testid="stored-thread-url">
            {activeTab.autoRefreshThreadUrl ?? ""}
          </output>
          <output data-testid="current-thread-enabled">
            {isCurrentThreadAutoRefreshEnabled ? "enabled" : "disabled"}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("thread-1 へ移動"));
    fireEvent.click(screen.getByText("thread-1 で自動更新ON"));

    expect(screen.getByTestId("stored-thread-url")).toHaveTextContent(
      "https://example.com/test/read.cgi/foo/1/",
    );
    expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent(
      "enabled",
    );

    fireEvent.click(screen.getByText("thread-2 へ移動"));

    expect(screen.getByTestId("stored-thread-url")).toHaveTextContent(
      "https://example.com/test/read.cgi/foo/1/",
    );
    expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent(
      "disabled",
    );
  });

  it("FOLLOW_NEXT_THREAD は現在タブの履歴と自動更新束縛を次スレへ引き継ぐ", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } =
      await import("src/view/browser/hooks/use-tab-store");

    function Harness() {
      const { activeTab, currentPage, dispatch } = useTabStore();
      const isCurrentThreadAutoRefreshEnabled =
        currentPage.type === "thread" &&
        activeTab.autoRefreshEnabled &&
        activeTab.autoRefreshThreadUrl === currentPage.threadUrl;

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-1",
                  threadUrl: "https://example.com/test/read.cgi/foo/1/",
                },
              })
            }
          >
            thread-1 へ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "SET_AUTO_REFRESH_ENABLED",
                enabled: true,
                threadUrl: "https://example.com/test/read.cgi/foo/1/",
              })
            }
          >
            thread-1 で自動更新ON
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "FOLLOW_NEXT_THREAD",
                page: {
                  type: "thread",
                  title: "thread-2",
                  threadUrl: "https://example.com/test/read.cgi/foo/2/",
                },
                keepAutoRefresh: true,
              })
            }
          >
            次スレへ追従
          </button>
          <output data-testid="stored-thread-url">
            {activeTab.autoRefreshThreadUrl ?? ""}
          </output>
          <output data-testid="history-length">
            {activeTab.history.length}
          </output>
          <output data-testid="current-thread-title">
            {currentPage.title}
          </output>
          <output data-testid="current-thread-enabled">
            {isCurrentThreadAutoRefreshEnabled ? "enabled" : "disabled"}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("thread-1 へ移動"));
    fireEvent.click(screen.getByText("thread-1 で自動更新ON"));
    fireEvent.click(screen.getByText("次スレへ追従"));

    expect(screen.getByTestId("stored-thread-url")).toHaveTextContent(
      "https://example.com/test/read.cgi/foo/2/",
    );
    expect(screen.getByTestId("history-length")).toHaveTextContent("3");
    expect(screen.getByTestId("current-thread-title")).toHaveTextContent(
      "thread-2",
    );
    expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent(
      "enabled",
    );
  });

  it("OPEN_IN_NEW_TAB では現在タブのページタイトルを変更しない", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } =
      await import("src/view/browser/hooks/use-tab-store");

    function Harness() {
      const { state, activeTab, currentPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "板A",
                  boardUrl: "https://example.com/board-a/",
                  boardTitle: "板A",
                },
              })
            }
          >
            板Aへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB",
                page: {
                  type: "thread",
                  title: "新規スレ",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            新規タブで開く
          </button>
          <output data-testid="active-tab-id">{activeTab.id}</output>
          <output data-testid="current-page-title">{currentPage.title}</output>
          <output data-testid="current-page-type">{currentPage.type}</output>
          <output data-testid="tabs-count">{state.tabs.length}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板Aへ移動"));
    const activeTabIdBefore = screen.getByTestId("active-tab-id").textContent;

    expect(screen.getByTestId("current-page-title")).toHaveTextContent("板A");
    expect(screen.getByTestId("current-page-type")).toHaveTextContent(
      "threadList",
    );

    fireEvent.click(screen.getByText("新規タブで開く"));

    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-tab-id").textContent).toBe(
      activeTabIdBefore,
    );
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("板A");
    expect(screen.getByTestId("current-page-type")).toHaveTextContent(
      "threadList",
    );
  });

  it("OPEN_IN_NEW_TAB で既存ページがある時は重複を作らず既存タブへフォーカスする", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } =
      await import("src/view/browser/hooks/use-tab-store");

    function Harness() {
      const { state, activeTab, currentPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "板A",
                  boardUrl: "https://example.com/board-a/",
                  boardTitle: "板A",
                },
              })
            }
          >
            板Aへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB",
                page: {
                  type: "thread",
                  title: "既存スレ",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            既存スレを新しいタブで開く
          </button>
          <output data-testid="tabs-count">{state.tabs.length}</output>
          <output data-testid="active-tab-id">{activeTab.id}</output>
          <output data-testid="current-page-title">{currentPage.title}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板Aへ移動"));
    const originalActiveTabId = screen.getByTestId("active-tab-id").textContent;

    fireEvent.click(screen.getByText("既存スレを新しいタブで開く"));
    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-tab-id").textContent).toBe(
      originalActiveTabId,
    );

    fireEvent.click(screen.getByText("既存スレを新しいタブで開く"));

    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-tab-id").textContent).not.toBe(
      originalActiveTabId,
    );
    expect(screen.getByTestId("current-page-title")).toHaveTextContent(
      "既存スレ",
    );
  });

  it("NAVIGATE で既存ページがある時は現在タブを書き換えず既存タブへ移動する", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } =
      await import("src/view/browser/hooks/use-tab-store");

    function Harness() {
      const { state, currentPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "板A",
                  boardUrl: "https://example.com/board-a/",
                  boardTitle: "板A",
                },
              })
            }
          >
            板Aへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB",
                page: {
                  type: "thread",
                  title: "既存スレ",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            既存スレを背景で開く
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "板B",
                  boardUrl: "https://example.com/board-b/",
                  boardTitle: "板B",
                },
              })
            }
          >
            板Bへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "既存スレ",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            既存スレをクリック
          </button>
          <output data-testid="tabs-count">{state.tabs.length}</output>
          <output data-testid="current-page-title">{currentPage.title}</output>
          <output data-testid="tab-titles">
            {state.tabs
              .map((tab) => tab.history[tab.currentIndex]?.title ?? "")
              .join("|")}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板Aへ移動"));
    fireEvent.click(screen.getByText("既存スレを背景で開く"));
    fireEvent.click(screen.getByText("板Bへ移動"));

    expect(screen.getByTestId("current-page-title")).toHaveTextContent("板B");

    fireEvent.click(screen.getByText("既存スレをクリック"));

    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent(
      "既存スレ",
    );
    expect(screen.getByTestId("tab-titles")).toHaveTextContent("板B|既存スレ");
  });

  it("クイックアクセス間の遷移で既存ページ判定が誤爆せず切り替わる", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } =
      await import("src/view/browser/hooks/use-tab-store");

    function Harness() {
      const { currentPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: { type: "bookmarkList", title: "ブックマークリスト" },
              })
            }
          >
            ブックマークを開く
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: { type: "historyList", title: "閲覧履歴" },
              })
            }
          >
            履歴を開く
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: { type: "writeHistoryList", title: "書き込み履歴" },
              })
            }
          >
            書き込み履歴を開く
          </button>
          <output data-testid="current-page-type">{currentPage.type}</output>
          <output data-testid="current-page-title">{currentPage.title}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("ブックマークを開く"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent(
      "bookmarkList",
    );

    fireEvent.click(screen.getByText("履歴を開く"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent(
      "historyList",
    );
    expect(screen.getByTestId("current-page-title")).toHaveTextContent(
      "閲覧履歴",
    );

    fireEvent.click(screen.getByText("書き込み履歴を開く"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent(
      "writeHistoryList",
    );
    expect(screen.getByTestId("current-page-title")).toHaveTextContent(
      "書き込み履歴",
    );
  });

  it("同一タブでスレURLへ遷移した時は戻るで前のスレへ戻る", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } =
      await import("src/view/browser/hooks/use-tab-store");

    function Harness() {
      const { currentPage, activeTab, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "板A",
                  boardUrl: "https://example.com/board-a/",
                  boardTitle: "板A",
                },
              })
            }
          >
            板Aへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-1",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            thread-1 へ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-2",
                  threadUrl: "https://example.com/test/read.cgi/board-a/2/",
                },
              })
            }
          >
            thread-2 へ移動
          </button>
          <button onClick={() => dispatch({ type: "GO_BACK" })}>戻る</button>
          <output data-testid="current-page-title">{currentPage.title}</output>
          <output data-testid="current-page-type">{currentPage.type}</output>
          <output data-testid="history-titles">
            {activeTab.history.map((page) => page.title).join("|")}
          </output>
          <output data-testid="history-index">
            {String(activeTab.currentIndex)}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板Aへ移動"));
    fireEvent.click(screen.getByText("thread-1 へ移動"));
    fireEvent.click(screen.getByText("thread-2 へ移動"));

    expect(screen.getByTestId("current-page-title")).toHaveTextContent(
      "thread-2",
    );
    expect(screen.getByTestId("history-titles")).toHaveTextContent(
      "ホーム|板A|thread-1|thread-2",
    );
    expect(screen.getByTestId("history-index")).toHaveTextContent("3");

    fireEvent.click(screen.getByText("戻る"));

    expect(screen.getByTestId("current-page-title")).toHaveTextContent(
      "thread-1",
    );
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("thread");
    expect(screen.getByTestId("history-index")).toHaveTextContent("2");
  });

  it("UPDATE_TITLE_FOR_TAB は対象タブだけを更新し、アクティブタブを汚染しない", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } =
      await import("src/view/browser/hooks/use-tab-store");

    function Harness() {
      const { state, activeTab, currentPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "アクティブ板",
                  boardUrl: "https://example.com/board-a/",
                  boardTitle: "アクティブ板",
                },
              })
            }
          >
            activeを板Aへ
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB",
                page: {
                  type: "thread",
                  title: "背景タブ初期",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            背景タブを開く
          </button>
          <button
            onClick={() => {
              const target = state.tabs.find(
                (tab) => tab.id !== state.activeTabId,
              );
              if (!target) return;
              dispatch({
                type: "UPDATE_TITLE_FOR_TAB",
                tabId: target.id,
                title: "背景タブ更新後",
              });
            }}
          >
            背景タブのタイトル更新
          </button>
          <output data-testid="tabs-count">{state.tabs.length}</output>
          <output data-testid="active-tab-id">{activeTab.id}</output>
          <output data-testid="active-page-title">{currentPage.title}</output>
          <output data-testid="background-page-title">
            {state.tabs
              .find((tab) => tab.id !== state.activeTabId)
              ?.history.at(-1)?.title ?? ""}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("activeを板Aへ"));
    const activeTabIdBefore = screen.getByTestId("active-tab-id").textContent;

    fireEvent.click(screen.getByText("背景タブを開く"));
    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");

    fireEvent.click(screen.getByText("背景タブのタイトル更新"));

    expect(screen.getByTestId("active-tab-id").textContent).toBe(
      activeTabIdBefore,
    );
    expect(screen.getByTestId("active-page-title")).toHaveTextContent(
      "アクティブ板",
    );
    expect(screen.getByTestId("background-page-title")).toHaveTextContent(
      "背景タブ更新後",
    );
  });

  it("板ページから新規タブで開いたスレは戻る時に板URLではなく板タイトルを維持する", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } =
      await import("src/view/browser/hooks/use-tab-store");

    function Harness() {
      const { state, currentPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "エッヂ",
                  boardUrl: "http://bbs.eddibb.cc/liveedge/",
                  boardTitle: "エッヂ",
                },
              })
            }
          >
            板へ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB_FORCE",
                page: {
                  type: "thread",
                  title: "スレ1",
                  threadUrl: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000005/",
                },
              })
            }
          >
            新規タブでスレ
          </button>
          <button
            onClick={() => {
              const background = state.tabs.find((tab) => tab.id !== state.activeTabId);
              if (!background) return;
              dispatch({ type: "SELECT_TAB", tabId: background.id });
            }}
          >
            背景タブへ切替
          </button>
          <button onClick={() => dispatch({ type: "GO_BACK" })}>戻る</button>
          <output data-testid="current-page-type">{currentPage.type}</output>
          <output data-testid="current-page-title">{currentPage.title}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板へ移動"));
    fireEvent.click(screen.getByText("新規タブでスレ"));
    fireEvent.click(screen.getByText("背景タブへ切替"));

    expect(screen.getByTestId("current-page-type")).toHaveTextContent("thread");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("スレ1");

    fireEvent.click(screen.getByText("戻る"));

    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("エッヂ");
  });
});
