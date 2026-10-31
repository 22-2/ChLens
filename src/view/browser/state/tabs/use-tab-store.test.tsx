import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import {
  resetModulesWithPageTypes,
  setupTabStoreTest,
} from "src/test-support/tab-store-test-support";
import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import { describe, expect, it, vi } from "vite-plus/test";

// use-tab-store はタイトル更新以外で platform を使わないため、
// 拡張機能専用 polyfill を読み込まずに reducer の振る舞い検証へ集中する。
vi.mock("src/app/platform", () => ({
  platform: {
    window: {
      setTitle: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

// webextension-polyfill は拡張機能環境以外では import 時に例外を投げるため、
// reducer の振る舞い検証に不要な runtime API を最小モックで差し替える。
vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  },
}));

describe("TabProvider auto refresh state", () => {
  setupTabStoreTest();

  it("別ページへ移動した時点で自動更新状態を解除する", async () => {
    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewTab, viewPage, dispatch } = useTabStore();
      const isCurrentThreadAutoRefreshEnabled =
        viewPage.type === "thread" &&
        viewTab.autoRefreshEnabled &&
        viewTab.autoRefreshPageKey === getAutoRefreshPageKey(viewPage);

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
                pageKey: "thread:https://example.com/test/read.cgi/foo/1/",
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
          <output data-testid="stored-thread-url">{viewTab.autoRefreshPageKey ?? ""}</output>
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
      "thread:https://example.com/test/read.cgi/foo/1/",
    );
    expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent("enabled");

    fireEvent.click(screen.getByText("thread-2 へ移動"));

    expect(screen.getByTestId("stored-thread-url")).toHaveTextContent("");
    expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent("disabled");
  });

  it("戻るで移動してきたページでも自動更新状態は復元しない", async () => {
    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewTab, viewPage, dispatch } = useTabStore();
      const isCurrentThreadAutoRefreshEnabled =
        viewPage.type === "thread" &&
        viewTab.autoRefreshEnabled &&
        viewTab.autoRefreshPageKey === getAutoRefreshPageKey(viewPage);

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
                pageKey: "thread:https://example.com/test/read.cgi/foo/1/",
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
          <button onClick={() => dispatch({ type: "GO_BACK" })}>戻る</button>
          <output data-testid="stored-thread-url">{viewTab.autoRefreshPageKey ?? ""}</output>
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
    fireEvent.click(screen.getByText("thread-2 へ移動"));
    fireEvent.click(screen.getByText("戻る"));

    expect(screen.getByTestId("stored-thread-url")).toHaveTextContent("");
    expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent("disabled");
  });

  it("セッション保存時に自動更新状態を永続化しない", async () => {
    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { dispatch } = useTabStore();

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
                pageKey: "thread:https://example.com/test/read.cgi/foo/1/",
              })
            }
          >
            thread-1 で自動更新ON
          </button>
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

    const raw = localStorage.getItem("chlens_browser_session");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "{}") as {
      panes: Array<{
        tabs: Array<{
          autoRefreshEnabled: boolean;
          autoRefreshPageKey: string | null;
        }>;
      }>;
    };

    // 一時状態は保存形式に含めず、復元時に既定値で作り直す。
    expect(parsed.panes[0].tabs[0]).not.toHaveProperty("autoRefreshEnabled");
    expect(parsed.panes[0].tabs[0]).not.toHaveProperty("autoRefreshPageKey");
    expect(parsed.panes[0].tabs[0]).not.toHaveProperty("reloadKey");
  });

  it("セッション復元時に保存済み自動更新状態をリセットする", async () => {
    localStorage.setItem(
      "chlens_browser_session",
      JSON.stringify({
        tabs: [
          {
            id: "tab-1",
            history: [
              {
                type: "thread",
                title: "thread-1",
                threadUrl: "https://example.com/test/read.cgi/foo/1/",
              },
            ],
            currentIndex: 0,
            pinned: false,
            reloadKey: 0,
            autoRefreshEnabled: true,
            autoRefreshPageKey: "thread:https://example.com/test/read.cgi/foo/1/",
            autoRefreshStoppedPageKey: "thread:https://example.com/test/read.cgi/foo/1/",
          },
        ],
        activeTabId: "tab-1",
        closedTabs: [],
      }),
    );

    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewTab } = useTabStore();
      return (
        <>
          <output data-testid="saved-enabled">
            {viewTab.autoRefreshEnabled ? "enabled" : "disabled"}
          </output>
          <output data-testid="saved-url">{viewTab.autoRefreshPageKey ?? ""}</output>
          <output data-testid="saved-stopped-url">{viewTab.autoRefreshStoppedPageKey ?? ""}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    expect(screen.getByTestId("saved-enabled")).toHaveTextContent("disabled");
    expect(screen.getByTestId("saved-url")).toHaveTextContent("");
    expect(screen.getByTestId("saved-stopped-url")).toHaveTextContent("");
  });

  it.each([true, false])(
    "dat落ち時のON状態が%sでも再開連打を拒否し、次スレでは解除する",
    async (initiallyEnabled) => {
      await resetModulesWithPageTypes();
      const { TabProvider, useTabStore } =
        await import("src/view/browser/state/tabs/use-tab-store");

      function Harness() {
        const { viewTab, viewPage, dispatch } = useTabStore();
        const isCurrentThreadAutoRefreshEnabled =
          viewPage.type === "thread" &&
          viewTab.autoRefreshEnabled &&
          viewTab.autoRefreshPageKey === getAutoRefreshPageKey(viewPage);

        return (
          <>
            <button
              onClick={() =>
                dispatch({
                  type: "SET_AUTO_REFRESH_STOPPED_PAGE_KEY",
                  pageKey: "thread:https://example.com/test/read.cgi/foo/1/",
                })
              }
            >
              thread-1をdat落ち停止
            </button>
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
                  pageKey: "thread:https://example.com/test/read.cgi/foo/1/",
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
            <output data-testid="stored-thread-url">{viewTab.autoRefreshPageKey ?? ""}</output>
            <output data-testid="stopped-thread-url">
              {viewTab.autoRefreshStoppedPageKey ?? ""}
            </output>
            <output data-testid="history-length">{viewTab.history.length}</output>
            <output data-testid="current-thread-title">{viewPage.title}</output>
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
      if (initiallyEnabled) {
        fireEvent.click(screen.getByText("thread-1 で自動更新ON"));
      }
      fireEvent.click(screen.getByText("thread-1をdat落ち停止"));
      expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent("disabled");
      for (let attempt = 0; attempt < 20; attempt++) {
        fireEvent.click(screen.getByText("thread-1 で自動更新ON"));
      }
      expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent("disabled");
      expect(screen.getByTestId("stored-thread-url").textContent).toBe("");
      expect(screen.getByTestId("stopped-thread-url")).toHaveTextContent(
        "thread:https://example.com/test/read.cgi/foo/1/",
      );
      fireEvent.click(screen.getByText("次スレへ追従"));

      expect(screen.getByTestId("stored-thread-url")).toHaveTextContent(
        "thread:https://example.com/test/read.cgi/foo/2/",
      );
      expect(screen.getByTestId("stopped-thread-url")).toHaveTextContent("");
      // 現仕様の NAVIGATE は祖先(home/板/スレ一覧)を自動補完しないため、
      // 初期[home] → thread-1 で1段 → thread-2 で1段の計3エントリになる。
      expect(screen.getByTestId("history-length")).toHaveTextContent("4");
      expect(screen.getByTestId("current-thread-title")).toHaveTextContent("thread-2");
      expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent("enabled");
    },
  );

  it("OPEN_IN_NEW_TAB では現在タブのページタイトルを変更しない", async () => {
    await resetModulesWithPageTypes();
    // 現仕様では新規タブを開くと既定でそちらへフォーカスが移る。
    // このテストの主眼は「元タブのページが汚染されないこと」なので、
    // 背景オープン設定にしてアクティブタブを元のままに固定して検証する。
    localStorage.setItem("config_focus_new_tab_on_open", "off");
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, viewTab, viewPage, dispatch } = useTabStore();

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
          <output data-testid="active-tab-id">{viewTab.id}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
          <output data-testid="current-page-type">{viewPage.type}</output>
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
});

setupTestPageTypes();
