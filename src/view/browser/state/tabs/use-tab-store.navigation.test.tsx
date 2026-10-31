import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import {
  resetModulesWithPageTypes,
  setupTabStoreTest,
} from "src/test-support/tab-store-test-support";
import { getPageViewStateKey } from "src/view/browser/page-type-definitions";
import { getCurrentPage } from "src/view/browser/types";
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

  it("描画対象タブを指定した操作はペインのactiveTabへ作用しない", async () => {
    await resetModulesWithPageTypes();
    const { TabProvider, useTabDispatchForTab, useTabStore } =
      await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, viewPage, dispatch } = useTabStore();
      const targetTabId = state.tabs[0]?.id ?? "";
      const targetDispatch = useTabDispatchForTab(targetTabId);
      const targetTab = state.tabs[0];

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "アクティブ側",
                  threadUrl: "https://example.com/test/read.cgi/board/active/",
                },
              })
            }
          >
            アクティブ側へ移動
          </button>
          <button onClick={() => dispatch({ type: "ADD_TAB" })}>別タブを追加</button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "別タブ側",
                  threadUrl: "https://example.com/test/read.cgi/board/other/",
                },
              })
            }
          >
            別タブ側へ移動
          </button>
          <button
            onClick={() =>
              targetDispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "描画対象側",
                  threadUrl: "https://example.com/test/read.cgi/board/target/",
                },
              })
            }
          >
            描画対象側へ移動
          </button>
          <button onClick={() => targetDispatch({ type: "RELOAD" })}>描画対象を更新</button>
          <button onClick={() => targetDispatch({ type: "GO_BACK" })}>描画対象を戻す</button>
          <output data-testid="target-title">
            {targetTab ? getCurrentPage(targetTab).title : ""}
          </output>
          <output data-testid="target-reload-key">{targetTab?.reloadKey ?? -1}</output>
          <output data-testid="active-title">{viewPage.title}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("アクティブ側へ移動"));
    fireEvent.click(screen.getByText("別タブを追加"));
    fireEvent.click(screen.getByText("別タブ側へ移動"));
    fireEvent.click(screen.getByText("描画対象側へ移動"));

    expect(screen.getByTestId("target-title")).toHaveTextContent("描画対象側");
    expect(screen.getByTestId("active-title")).toHaveTextContent("別タブ側");

    fireEvent.click(screen.getByText("描画対象を更新"));
    expect(screen.getByTestId("target-reload-key")).toHaveTextContent("1");
    expect(screen.getByTestId("active-title")).toHaveTextContent("別タブ側");

    fireEvent.click(screen.getByText("描画対象を戻す"));
    expect(screen.getByTestId("target-title")).toHaveTextContent("アクティブ側");
    expect(screen.getByTestId("active-title")).toHaveTextContent("別タブ側");
  });

  it("別窓の表示対象とペインの選択対象を分離する", async () => {
    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");
    const { TabViewScopeProvider } = await import("src/view/browser/state/tabs/use-tab-view-scope");
    const { tabActions } = await import("src/view/browser/state/tabs/tab-store-actions");

    function ScopedView() {
      const { selectedTabId, viewTabId, selectedTab, viewPage, dispatch } = useTabStore();

      return (
        <>
          <output data-testid="scoped-selected-id">{selectedTabId}</output>
          <output data-testid="scoped-view-id">{viewTabId}</output>
          <output data-testid="scoped-selected-title">{getCurrentPage(selectedTab).title}</output>
          <output data-testid="scoped-view-title">{viewPage.title}</output>
          <button
            onClick={() =>
              dispatch(
                tabActions.navigate({
                  type: "thread",
                  title: "別窓で移動したスレ",
                  threadUrl: "https://example.com/test/read.cgi/board/detached/",
                }),
              )
            }
          >
            別窓側へ移動
          </button>
        </>
      );
    }

    function Harness() {
      const { state, paneId, selectedTabId, viewTabId, dispatch } = useTabStore();
      // 変更理由: 常設ホームタブを除外し、選択中と異なる通常タブを別窓対象にする。
      const detachedTabId = state.tabs.find((tab) => tab.id !== selectedTabId)?.id;

      return (
        <>
          <output data-testid="main-selected-id">{selectedTabId}</output>
          <output data-testid="main-view-id">{viewTabId}</output>
          <button
            onClick={() =>
              dispatch(
                tabActions.openInNewTab(
                  {
                    type: "thread",
                    title: "別窓候補のスレ",
                    threadUrl: "https://example.com/test/read.cgi/board/candidate/",
                  },
                  { background: true },
                ),
              )
            }
          >
            別窓候補を追加
          </button>
          {detachedTabId ? (
            <TabViewScopeProvider scope={{ paneId, tabId: detachedTabId }}>
              <ScopedView />
            </TabViewScopeProvider>
          ) : null}
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    const mainSelectedId = screen.getByTestId("main-selected-id").textContent;
    expect(mainSelectedId).toBeTruthy();
    expect(screen.getByTestId("main-view-id")).toHaveTextContent(mainSelectedId ?? "");

    fireEvent.click(screen.getByText("別窓候補を追加"));

    const scopedSelectedId = screen.getByTestId("scoped-selected-id").textContent;
    const scopedViewId = screen.getByTestId("scoped-view-id").textContent;
    expect(scopedSelectedId).toBe(mainSelectedId);
    expect(scopedViewId).not.toBe(scopedSelectedId);
    expect(screen.getByTestId("scoped-selected-title")).toHaveTextContent("板一覧");
    expect(screen.getByTestId("scoped-view-title")).toHaveTextContent("別窓候補のスレ");

    fireEvent.click(screen.getByText("別窓側へ移動"));

    expect(screen.getByTestId("scoped-selected-id")).toHaveTextContent(mainSelectedId ?? "");
    expect(screen.getByTestId("scoped-view-id")).toHaveTextContent(scopedViewId ?? "");
    expect(screen.getByTestId("scoped-view-title")).toHaveTextContent("別窓で移動したスレ");
    expect(screen.getByTestId("main-selected-id")).toHaveTextContent(mainSelectedId ?? "");
  });

  it("クイックアクセス間の遷移で既存ページ判定が誤爆せず切り替わる", async () => {
    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewPage, dispatch } = useTabStore();

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
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("ブックマークを開く"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("bookmarkList");

    fireEvent.click(screen.getByText("履歴を開く"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("historyList");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("閲覧履歴");

    fireEvent.click(screen.getByText("書き込み履歴を開く"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("writeHistoryList");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("書き込み履歴");
  });

  it("同一タブでスレURLへ遷移した時は戻るで前のスレへ戻る", async () => {
    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewPage, viewTab, dispatch } = useTabStore();

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
          <output data-testid="current-page-title">{viewPage.title}</output>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="history-titles">
            {viewTab.history.map((page) => page.title).join("|")}
          </output>
          <output data-testid="history-index">{String(viewTab.currentIndex)}</output>
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

    expect(screen.getByTestId("current-page-title")).toHaveTextContent("thread-2");
    // 祖先の自動補完なし: ユーザーが実際に訪れたページのみ積まれる
    expect(screen.getByTestId("history-titles")).toHaveTextContent("ホーム|板A|thread-1|thread-2");
    expect(screen.getByTestId("history-index")).toHaveTextContent("3");

    fireEvent.click(screen.getByText("戻る"));

    expect(screen.getByTestId("current-page-title")).toHaveTextContent("thread-1");
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("thread");
    expect(screen.getByTestId("history-index")).toHaveTextContent("2");
  });

  it("ホームからURL直開きしたスレはスレ一覧を経由してホームへ戻る", async () => {
    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewPage, viewTab, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() => {
              dispatch({ type: "GO_TO_HISTORY_INDEX", index: 0 });
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "direct-thread",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              });
            }}
          >
            スレをURL直開き
          </button>
          <button onClick={() => dispatch({ type: "GO_BACK" })}>戻る</button>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
          <output data-testid="history-titles">
            {viewTab.history.map((page) => page.title).join("|")}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("スレをURL直開き"));

    // URL直開きでもスレ一覧を補い、同じタブのホームへ戻れるようにする。
    expect(screen.getByTestId("history-titles")).toHaveTextContent(
      "ホーム|https://example.com/board-a/|direct-thread",
    );

    fireEvent.click(screen.getByText("戻る"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
    fireEvent.click(screen.getByText("戻る"));

    expect(screen.getByTestId("current-page-type")).toHaveTextContent("home");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("ホーム");
  });

  it("UPDATE_TITLE_FOR_TAB は対象タブだけを更新し、アクティブタブを汚染しない", async () => {
    await resetModulesWithPageTypes();
    // 背景タブを開いた状態を作るため、新規タブのフォーカス移動を無効化する。
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
              const target = state.tabs.find((tab) => tab.id !== state.selectedTabId);
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
          <output data-testid="active-tab-id">{viewTab.id}</output>
          <output data-testid="active-page-title">{viewPage.title}</output>
          <output data-testid="background-page-title">
            {state.tabs.find((tab) => tab.id !== state.selectedTabId)?.history.at(-1)?.title ?? ""}
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
    expect(screen.getByTestId("background-page-title")).toHaveTextContent("背景タブ更新後");
  });

  it("ホームから板URLを直接開くと履歴に積まれ、進むは効かない", async () => {
    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewPage, viewTab, dispatch } = useTabStore();

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
            板URL直開き
          </button>
          <button onClick={() => dispatch({ type: "GO_FORWARD" })}>進む</button>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="history-titles">
            {viewTab.history.map((page) => page.title).join("|")}
          </output>
          <output data-testid="history-index">{String(viewTab.currentIndex)}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板URL直開き"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
    // 祖先の自動補完なし: ホームと板だけが積まれる
    expect(screen.getByTestId("history-titles")).toHaveTextContent("ホーム|板A");
    expect(screen.getByTestId("history-index")).toHaveTextContent("1");

    fireEvent.click(screen.getByText("進む"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
    expect(screen.getByTestId("history-index")).toHaveTextContent("1");
  });

  it("新規タブ操作は通常のホームを追加し、進むは効かない", async () => {
    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, viewPage, dispatch } = useTabStore();

      return (
        <>
          <button onClick={() => dispatch({ type: "ADD_TAB" })}>新規タブ</button>
          <button onClick={() => dispatch({ type: "GO_FORWARD" })}>進む</button>
          <output data-testid="tabs-count">{state.tabs.length}</output>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="history-length">
            {String(state.tabs.find((tab) => tab.id === state.selectedTabId)?.history.length ?? 0)}
          </output>
          <output data-testid="history-index">
            {String(state.tabs.find((tab) => tab.id === state.selectedTabId)?.currentIndex ?? -1)}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("新規タブ"));
    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("home");
    expect(screen.getByTestId("history-length")).toHaveTextContent("1");
    expect(screen.getByTestId("history-index")).toHaveTextContent("0");

    fireEvent.click(screen.getByText("進む"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("home");
    expect(screen.getByTestId("history-index")).toHaveTextContent("0");
  });

  it("関連する板モードの新規タブはスレ履歴内の確定板名を再利用する", async () => {
    localStorage.setItem("config_new_tab_page_mode", "related_board");

    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "Software",
                  boardUrl: "https://egg.5ch.net/software/",
                  boardTitle: "Software",
                },
              })
            }
          >
            板へ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "スレA",
                  threadUrl: "https://egg.5ch.net/test/read.cgi/software/1000000004/",
                },
              })
            }
          >
            スレへ移動
          </button>
          <button onClick={() => dispatch({ type: "ADD_TAB" })}>新規タブ</button>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
          <output data-testid="current-page-board-title">
            {viewPage.type === "threadList" ? viewPage.boardTitle : ""}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板へ移動"));
    fireEvent.click(screen.getByText("スレへ移動"));
    fireEvent.click(screen.getByText("新規タブ"));

    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("Software");
    expect(screen.getByTestId("current-page-board-title")).toHaveTextContent("Software");
  });

  it("関連板から別板のスレをURL直開きした戻るで前居た板へ戻る", async () => {
    localStorage.setItem("config_new_tab_page_mode", "related_board");

    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewPage, viewTab, dispatch } = useTabStore();

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
            板Aへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "スレA",
                  threadUrl: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000006/",
                },
              })
            }
          >
            板Aのスレへ移動
          </button>
          <button onClick={() => dispatch({ type: "ADD_TAB" })}>関連板の新規タブ</button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "スレB",
                  threadUrl: "https://egg.5ch.io/test/read.cgi/software/123/",
                },
              })
            }
          >
            板BのスレをURL直開き
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "UPDATE_TITLE_FOR_TAB",
                tabId: viewTab.id,
                title: "Software",
                boardUrl: "https://egg.5ch.io/software/",
              })
            }
          >
            板B名を解決
          </button>
          <button onClick={() => dispatch({ type: "GO_BACK" })}>戻る</button>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
          <output data-testid="current-page-board-url">
            {viewPage.type === "threadList" ? viewPage.boardUrl : ""}
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
    fireEvent.click(screen.getByText("板Aのスレへ移動"));
    fireEvent.click(screen.getByText("関連板の新規タブ"));
    fireEvent.click(screen.getByText("板BのスレをURL直開き"));
    fireEvent.click(screen.getByText("板B名を解決"));
    fireEvent.click(screen.getByText("戻る"));

    // 変更理由: 同一タブの遷移は実際に訪れたページだけを積み、前居た関連板へ戻れるようにする。
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("エッヂ");
    expect(screen.getByTestId("current-page-board-url")).toHaveTextContent(
      "http://bbs.eddibb.cc/liveedge/",
    );
  });

  it("板ページから新規タブで開いたスレは戻る時に板URLではなく板タイトルを維持する", async () => {
    await resetModulesWithPageTypes();
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
                  threadUrl: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000006/",
                },
              })
            }
          >
            新規タブでスレ
          </button>
          <button
            onClick={() => {
              const background = state.tabs.find((tab) => tab.id !== state.selectedTabId);
              if (!background) return;
              dispatch({ type: "SELECT_TAB", tabId: background.id });
            }}
          >
            背景タブへ切替
          </button>
          <button onClick={() => dispatch({ type: "GO_BACK" })}>戻る</button>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
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

  it("タブごとの検索状態をスレ遷移とセッション保存で維持する", async () => {
    await resetModulesWithPageTypes();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");
    const thread1 = {
      type: "thread" as const,
      title: "スレ1",
      threadUrl: "https://example.com/test/read.cgi/foo/1/",
    };
    const thread2 = {
      type: "thread" as const,
      title: "スレ2",
      threadUrl: "https://example.com/test/read.cgi/foo/2/",
    };

    function Harness() {
      const { viewTab, viewPage, dispatch } = useTabStore();
      const currentViewState = viewTab.viewStates?.[getPageViewStateKey(viewPage)];

      return (
        <>
          <button onClick={() => dispatch({ type: "NAVIGATE", page: thread1 })}>スレ1へ移動</button>
          <button
            onClick={() =>
              dispatch({
                type: "UPDATE_TAB_VIEW_STATE",
                tabId: viewTab.id,
                pageKey: getPageViewStateKey(thread1),
                patch: { searchQuery: "保存する検索語", filter: "image", searchTarget: "name" },
              })
            }
          >
            スレ1の検索状態を保存
          </button>
          <button onClick={() => dispatch({ type: "NAVIGATE", page: thread2 })}>スレ2へ移動</button>
          <button onClick={() => dispatch({ type: "GO_BACK" })}>スレ1へ戻る</button>
          <output data-testid="current-thread-url">
            {viewPage.type === "thread" ? viewPage.threadUrl : ""}
          </output>
          <output data-testid="current-search-query">{currentViewState?.searchQuery ?? ""}</output>
          <output data-testid="current-filter">{currentViewState?.filter ?? ""}</output>
          <output data-testid="current-search-target">
            {currentViewState?.searchTarget ?? ""}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("スレ1へ移動"));
    fireEvent.click(screen.getByText("スレ1の検索状態を保存"));
    fireEvent.click(screen.getByText("スレ2へ移動"));

    expect(screen.getByTestId("current-thread-url")).toHaveTextContent(thread2.threadUrl);
    expect(screen.getByTestId("current-search-query")).toHaveTextContent("保存する検索語");
    expect(screen.getByTestId("current-filter")).toHaveTextContent("image");
    expect(screen.getByTestId("current-search-target")).toHaveTextContent("name");

    fireEvent.click(screen.getByText("スレ1へ戻る"));

    expect(screen.getByTestId("current-thread-url")).toHaveTextContent(thread1.threadUrl);
    expect(screen.getByTestId("current-search-query")).toHaveTextContent("保存する検索語");
    expect(screen.getByTestId("current-filter")).toHaveTextContent("image");
    expect(screen.getByTestId("current-search-target")).toHaveTextContent("name");

    await waitFor(() => {
      const raw = localStorage.getItem("chlens_browser_session");
      const parsed = JSON.parse(raw ?? "{}") as {
        panes?: Array<{
          tabs?: Array<{
            locked?: boolean;
            viewStates?: Record<string, { searchQuery?: string; searchTarget?: string }>;
          }>;
        }>;
      };
      // 変更理由: 先頭は常設ホームタブのため、通常タブを探して検証する。
      const targetTab = parsed.panes?.[0]?.tabs?.find((tab) => !tab.locked);
      expect(targetTab?.viewStates?.[getPageViewStateKey(thread1)]?.searchQuery).toBe(
        "保存する検索語",
      );
      expect(targetTab?.viewStates?.[getPageViewStateKey(thread1)]?.searchTarget).toBe("name");
    });
  });
});

setupTestPageTypes();
