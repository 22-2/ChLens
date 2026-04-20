import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("TabProvider auto refresh state", () => {
  beforeEach(() => {
    localStorage.removeItem("readcrx_browser_session");
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  it("現在のスレッドURLにだけ自動更新を束縛する", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import(
      "src/view/browser/hooks/use-tab-store"
    );

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

  it("OPEN_IN_NEW_TAB では現在タブのページタイトルを変更しない", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import(
      "src/view/browser/hooks/use-tab-store"
    );

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
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");

    fireEvent.click(screen.getByText("新規タブで開く"));

    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-tab-id").textContent).toBe(activeTabIdBefore);
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("板A");
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
  });

  it("UPDATE_TITLE_FOR_TAB は対象タブだけを更新し、アクティブタブを汚染しない", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import(
      "src/view/browser/hooks/use-tab-store"
    );

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
              const target = state.tabs.find((tab) => tab.id !== state.activeTabId);
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
            {
              state.tabs
                .find((tab) => tab.id !== state.activeTabId)
                ?.history.at(-1)?.title ?? ""
            }
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

    expect(screen.getByTestId("active-tab-id").textContent).toBe(activeTabIdBefore);
    expect(screen.getByTestId("active-page-title")).toHaveTextContent("アクティブ板");
    expect(screen.getByTestId("background-page-title")).toHaveTextContent(
      "背景タブ更新後",
    );
  });
});
