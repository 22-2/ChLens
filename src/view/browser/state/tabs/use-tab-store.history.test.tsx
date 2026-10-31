import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import {
  historyAddMock,
  historyGetByUrlMock,
  historyRemoveMock,
  resetModulesWithPageTypes,
  setupTabStoreTest,
} from "src/test-support/tab-store-test-support";
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

  it("OPEN_IN_NEW_TAB した背景スレは表示前でも閲覧履歴へ記録する", async () => {
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
                  title: "背景スレ",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            背景タブでスレを開く
          </button>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板Aへ移動"));
    historyAddMock.mockClear();

    fireEvent.click(screen.getByText("背景タブでスレを開く"));

    expect(historyAddMock).toHaveBeenCalledTimes(1);
    expect(historyAddMock).toHaveBeenCalledWith(
      "https://example.com/test/read.cgi/board-a/1/",
      "背景スレ",
      expect.any(Number),
      "board-a",
    );
  });

  it("URL直開きのスレはタイトル解決後に同じ履歴レコードを補正する", async () => {
    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "https://example.com/test/read.cgi/board-a/1/",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            URL直開き
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "UPDATE_TITLE_FOR_TAB",
                tabId: state.selectedTabId,
                title: "解決後タイトル",
              })
            }
          >
            タイトル解決
          </button>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("URL直開き"));

    await waitFor(() => {
      expect(historyAddMock).toHaveBeenCalledWith(
        "https://example.com/test/read.cgi/board-a/1/",
        "https://example.com/test/read.cgi/board-a/1/",
        expect.any(Number),
        "board-a",
      );
    });

    const recordedDate = historyAddMock.mock.calls[0][2] as number;
    historyAddMock.mockClear();

    fireEvent.click(screen.getByText("タイトル解決"));

    await waitFor(() => {
      expect(historyRemoveMock).toHaveBeenCalledWith(
        "https://example.com/test/read.cgi/board-a/1/",
        recordedDate,
      );
      expect(historyAddMock).toHaveBeenCalledWith(
        "https://example.com/test/read.cgi/board-a/1/",
        "解決後タイトル",
        recordedDate,
        "board-a",
      );
    });
  });

  it("新しいタブでURL直開きしたスレも描画中のタブIDで履歴タイトルを補正する", async () => {
    // reducerを2回評価していた頃は、履歴記録に使うタブIDと描画されたタブIDが食い違い、
    // タイトル解決後の補正が対象の閲覧記録を見つけられずURLのまま残っていた。
    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");
    const threadUrl = "https://example.com/test/read.cgi/board-a/2/";

    function Harness() {
      const { state, stateRef, dispatch } = useTabStore();
      const openedTab = state.tabs.at(-1);

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB",
                page: { type: "thread", title: threadUrl, threadUrl },
              })
            }
          >
            新しいタブでURL直開き
          </button>
          <button
            onClick={() =>
              openedTab &&
              dispatch({
                type: "UPDATE_TITLE_FOR_TAB",
                tabId: openedTab.id,
                title: "解決後タイトル",
              })
            }
          >
            タイトル解決
          </button>
          <output data-testid="rendered-tab-id">{openedTab?.id}</output>
          <output data-testid="ref-tab-id">{stateRef.current.panes[0].tabs.at(-1)?.id}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("新しいタブでURL直開き"));
    expect(screen.getByTestId("ref-tab-id").textContent).toBe(
      screen.getByTestId("rendered-tab-id").textContent,
    );
    await waitFor(() => expect(historyAddMock).toHaveBeenCalledTimes(1));
    const recordedDate = historyAddMock.mock.calls[0][2] as number;
    historyAddMock.mockClear();

    fireEvent.click(screen.getByText("タイトル解決"));

    await waitFor(() => {
      expect(historyRemoveMock).toHaveBeenCalledWith(threadUrl, recordedDate);
      expect(historyAddMock).toHaveBeenCalledWith(
        threadUrl,
        "解決後タイトル",
        recordedDate,
        "board-a",
      );
    });
  });

  it("履歴からURLだけで開いた過去スレは既存タイトルを引き継ぐ", async () => {
    await resetModulesWithPageTypes();
    historyGetByUrlMock.mockResolvedValueOnce([
      {
        url: "https://example.com/test/read.cgi/board-a/1/",
        title: "過去スレのタイトル",
        date: 123,
        boardTitle: "board-a",
        isHttps: true,
      },
    ]);
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { dispatch } = useTabStore();
      return (
        <button
          onClick={() =>
            dispatch({
              type: "NAVIGATE",
              page: {
                type: "thread",
                title: "https://example.com/test/read.cgi/board-a/1/",
                threadUrl: "https://example.com/test/read.cgi/board-a/1/",
              },
            })
          }
        >
          過去スレを開く
        </button>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("過去スレを開く"));

    await waitFor(() => {
      expect(historyAddMock).toHaveBeenCalledWith(
        "https://example.com/test/read.cgi/board-a/1/",
        "過去スレのタイトル",
        expect.any(Number),
        "board-a",
      );
    });
  });

  it.each([
    { focusSetting: "off", background: undefined },
    { focusSetting: "off", background: true },
    { focusSetting: "on", background: true },
  ])(
    "新規スレは背景で開き、既存スレにはフォーカスする（設定=$focusSetting、背景指定=$background）",
    async ({ focusSetting, background }) => {
      await resetModulesWithPageTypes();
      localStorage.setItem("config_focus_new_tab_on_open", focusSetting);
      const { TabProvider, useTabStore } =
        await import("src/view/browser/state/tabs/use-tab-store");

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
                  background,
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
            <output data-testid="active-tab-id">{viewTab.id}</output>
            <output data-testid="current-page-title">{viewPage.title}</output>
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
      expect(screen.getByTestId("active-tab-id").textContent).toBe(originalActiveTabId);

      // 現仕様では重複防止が働くため、同じURLを再度開いても新規タブは増えず、
      // 既存の該当タブへフォーカスが移る（背景設定でも重複時はそのタブを表示する）。
      fireEvent.click(screen.getByText("既存スレを新しいタブで開く"));

      expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
      expect(screen.getByTestId("active-tab-id").textContent).not.toBe(originalActiveTabId);
      expect(screen.getByTestId("current-page-title")).toHaveTextContent("既存スレ");
    },
  );

  it("OPEN_IN_NEW_TAB は設定オン時に新しいタブをアクティブにする", async () => {
    await resetModulesWithPageTypes();
    localStorage.setItem("config_focus_new_tab_on_open", "on");
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
                  title: "既存スレ",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            既存スレを新しいタブで開く
          </button>
          <output data-testid="tabs-count">{state.tabs.length}</output>
          <output data-testid="active-tab-id">{viewTab.id}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
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
    expect(screen.getByTestId("active-tab-id").textContent).not.toBe(originalActiveTabId);
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("既存スレ");
  });

  it("NAVIGATE は別タブに同じページがあっても現在タブの履歴に積む", async () => {
    await resetModulesWithPageTypes();
    // 既存スレを別タブで開く操作は背景前提なので、
    // フォーカス移動でアクティブタブが入れ替わらないよう背景オープン設定にする。
    localStorage.setItem("config_focus_new_tab_on_open", "off");
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, viewPage, dispatch } = useTabStore();

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
          <output data-testid="current-page-title">{viewPage.title}</output>
          <output data-testid="tab-titles">
            {state.tabs.map((tab) => tab.history[tab.currentIndex]?.title ?? "").join("|")}
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

    // タブ数は変わらず、現在タブの履歴に積まれる（別タブへ飛ばない）
    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("既存スレ");
    expect(screen.getByTestId("tab-titles")).toHaveTextContent("既存スレ|既存スレ");
  });
});

setupTestPageTypes();
