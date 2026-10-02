import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import type { Dispatch } from "react";
import type { ScopedTabAction, TabStoreState } from "src/view/browser/hooks/tab-store-types";
import { canGoBack, createHomeTab, getCurrentPage, type Tab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/app/platform", () => ({
  platform: { window: { setTitle: vi.fn(async () => undefined) } },
}));
vi.mock("src/core/History", () => ({
  add: vi.fn(async () => undefined),
  getByUrl: vi.fn(async () => []),
  remove: vi.fn(async () => undefined),
}));
vi.mock("webextension-polyfill", () => ({
  default: { runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() } } },
}));

const board = {
  type: "threadList" as const,
  title: "サンプル板",
  boardTitle: "サンプル板",
  boardUrl: "https://example.com/sample/",
};
let dispatch: Dispatch<ScopedTabAction>;
let stateRef: { current: TabStoreState };

beforeEach(() => {
  vi.resetModules();
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
  };
  vi.stubGlobal("localStorage", storage);
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mount(saved?: TabStoreState) {
  if (saved) localStorage.setItem("chlens_browser_session", JSON.stringify(saved));
  const { TabProvider, useTabStore } = await import("src/view/browser/hooks/use-tab-store");
  function Harness() {
    const store = useTabStore();
    dispatch = store.dispatch;
    stateRef = store.stateRef;
    return <output data-testid="page">{store.viewPage.type}</output>;
  }
  render(
    <TabProvider>
      <Harness />
    </TabProvider>,
  );
}

function activeTab() {
  const pane = stateRef.current.panes.find(
    (candidate) => candidate.id === stateRef.current.activePaneId,
  )!;
  return pane.tabs.find((tab) => tab.id === pane.activeTabId)!;
}

describe("スレ一覧から常設ホームへの戻る", () => {
  it("ホームだけのペインを分割・統合してもホームの選択を保つ", async () => {
    await mount();
    act(() => dispatch({ type: "SPLIT_PANE" }));
    expect(stateRef.current.panes).toHaveLength(2);
    act(() => dispatch({ type: "CLOSE_PANE" }));
    expect(stateRef.current.panes).toHaveLength(1);
    expect(stateRef.current.panes[0].tabs).toHaveLength(1);
    expect(screen.getByTestId("page")).toHaveTextContent("home");
  });

  it("初期表示と既定の新規タブ操作はホームだけを選び、板一覧は明示的に開く", async () => {
    await mount();
    expect(screen.getByTestId("page")).toHaveTextContent("home");
    expect(stateRef.current.panes[0].tabs).toHaveLength(1);
    act(() => dispatch({ type: "ADD_TAB" }));
    expect(stateRef.current.panes[0].tabs).toHaveLength(1);
    act(() => dispatch({ type: "NAVIGATE", page: { type: "boardList", title: "板一覧" } }));
    expect(screen.getByTestId("page")).toHaveTextContent("boardList");
    expect(stateRef.current.panes[0].tabs).toHaveLength(1);
    expect(activeTab().locked).toBe(true);
    expect(canGoBack(activeTab())).toBe(true);
    act(() => dispatch({ type: "NAVIGATE", page: { type: "boardList", title: "板一覧" } }));
    expect(activeTab().history).toHaveLength(2);
    act(() => dispatch({ type: "GO_BACK" }));
    expect(screen.getByTestId("page")).toHaveTextContent("home");
  });

  it("ホーム内の板一覧で板を選ぶと別タブを開き、戻るではホームの最初の画面を選ぶ", async () => {
    await mount();
    act(() => dispatch({ type: "NAVIGATE", page: { type: "boardList", title: "板一覧" } }));
    const homeId = activeTab().id;
    act(() =>
      dispatch({
        type: "UPDATE_TAB_VIEW_STATE",
        tabId: homeId,
        pageKey: "boardList",
        patch: { searchQuery: "サンプル" },
      }),
    );
    act(() => dispatch({ type: "NAVIGATE", page: board }));
    expect(activeTab().locked).toBeFalsy();
    expect(activeTab().history).toEqual([board]);
    expect(stateRef.current.panes[0].tabs).toHaveLength(2);
    act(() => dispatch({ type: "GO_BACK" }));
    expect(activeTab().id).toBe(homeId);
    expect(screen.getByTestId("page")).toHaveTextContent("home");
    act(() => dispatch({ type: "NAVIGATE", page: { type: "boardList", title: "板一覧" } }));
    expect(activeTab().viewStates?.boardList.searchQuery).toBe("サンプル");
    expect(stateRef.current.panes[0].tabs).toHaveLength(2);
  });

  it("ホーム内の板一覧と検索状態をセッションから復元する", async () => {
    const home = {
      ...createHomeTab("saved-home"),
      history: [
        { type: "home" as const, title: "ホーム" },
        { type: "boardList" as const, title: "板一覧" },
      ],
      currentIndex: 1,
      viewStates: { boardList: { searchQuery: "保存済み" } },
    };
    await mount({
      panes: [{ id: "saved", tabs: [home], activeTabId: home.id }],
      activePaneId: "saved",
      closedTabs: [],
    });
    expect(screen.getByTestId("page")).toHaveTextContent("boardList");
    expect(activeTab().viewStates?.boardList.searchQuery).toBe("保存済み");
    act(() => dispatch({ type: "GO_BACK" }));
    expect(screen.getByTestId("page")).toHaveTextContent("home");
  });

  it("ホームから開いた板の履歴先頭でも戻れるが、スレ一覧タブの状態は保つ", async () => {
    await mount();
    act(() => dispatch({ type: "NAVIGATE", page: board }));
    const original = activeTab();
    expect(original.history.map((page) => page.type)).toEqual(["threadList"]);
    expect(canGoBack(original)).toBe(true);
    act(() => dispatch({ type: "GO_BACK" }));
    expect(screen.getByTestId("page")).toHaveTextContent("home");
    expect(stateRef.current.panes[0].tabs.find((tab) => tab.id === original.id)).toEqual(original);
    expect(canGoBack(activeTab())).toBe(false);
  });

  it("すべて閉じるの置き換え先がホームでも常設ホームは1枚だけ残る", async () => {
    localStorage.setItem("config_new_tab_page_mode", "home");
    await mount();
    act(() => dispatch({ type: "NAVIGATE", page: board }));
    act(() => dispatch({ type: "CLOSE_ALL_TABS" }));
    expect(stateRef.current.panes[0].tabs).toHaveLength(1);
    expect(screen.getByTestId("page")).toHaveTextContent("home");
  });

  it("スレッドからはスレ一覧へ戻り、次の戻るでホームを選ぶ", async () => {
    await mount();
    act(() =>
      dispatch({
        type: "OPEN_IN_NEW_TAB_FORCE",
        page: {
          type: "thread",
          title: "スレッド",
          threadUrl: "https://example.com/test/read.cgi/sample/1/",
        },
        focus: true,
      }),
    );
    expect(activeTab().history.map((page) => page.type)).toEqual(["threadList", "thread"]);
    act(() => dispatch({ type: "GO_BACK" }));
    expect(screen.getByTestId("page")).toHaveTextContent("threadList");
    act(() => dispatch({ type: "GO_BACK" }));
    expect(screen.getByTestId("page")).toHaveTextContent("home");
  });

  it("別ペインの旧セッションに板一覧の祖先があっても、対象ペインのホームへ戻る", async () => {
    const tab: Tab = {
      ...createHomeTab("right-board"),
      locked: false,
      pinned: false,
      history: [{ type: "boardList", title: "板一覧" }, board],
      currentIndex: 1,
    };
    const leftHome = createHomeTab("left-home");
    const rightHome = createHomeTab("right-home");
    await mount({
      panes: [
        { id: "left", tabs: [leftHome], activeTabId: leftHome.id },
        { id: "right", tabs: [rightHome, tab], activeTabId: tab.id },
      ],
      activePaneId: "left",
      closedTabs: [],
    });
    act(() => dispatch({ type: "GO_BACK", paneId: "right", tabId: tab.id }));
    expect(stateRef.current.activePaneId).toBe("right");
    expect(activeTab().id).toBe(rightHome.id);
    expect(
      getCurrentPage(stateRef.current.panes[1].tabs.find((candidate) => candidate.id === tab.id)!),
    ).toEqual(board);
    expect(stateRef.current.panes[0].activeTabId).toBe(leftHome.id);
  });
});
