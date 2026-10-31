import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { TabBar } from "src/features/tabs/ui/TabBar";
import { container } from "src/service-container/index";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import {
  dispatchMock,
  dragState,
  mocks,
  setupTabBarTest,
} from "src/test-support/tab-bar-test-mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/view/browser/ui/ContextMenu", async () =>
  (await import("src/test-support/tab-bar-test-mocks")).createContextMenuModule(),
);
vi.mock("src/features/tabs/ui/TabContextMenu", async () =>
  (await import("src/test-support/tab-bar-test-mocks")).createTabContextMenuModule(),
);
vi.mock("src/view/browser/state/tabs/use-tab-store", async () =>
  (await import("src/test-support/tab-bar-test-mocks")).createTabStoreModule(),
);
vi.mock("src/features/auto-refresh/browser/use-auto-scroll-state", async () =>
  (await import("src/test-support/tab-bar-test-mocks")).createAutoScrollStateModule(),
);
vi.mock("src/features/tabs/browser/use-detached-tab-controller", async () =>
  (await import("src/test-support/tab-bar-test-mocks")).createDetachedTabControllerModule(),
);
vi.mock("@dnd-kit/react", async () =>
  (await import("src/test-support/tab-bar-test-mocks")).createDndKitModule(),
);
vi.mock("@dnd-kit/react/sortable", async () =>
  (await import("src/test-support/tab-bar-test-mocks")).createDndKitSortableModule(),
);

setupTabBarTest();

describe("TabBar drag-to-reorder", () => {
  beforeEach(() => {
    mocks.tabStore.state = {
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "boardList", title: "ホーム" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null as string | null,
        },
        {
          id: "tab-2",
          history: [{ type: "boardList", title: "板一覧" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null as string | null,
        },
      ],
      selectedTabId: "tab-1",
      closedTabs: [],
    };
    mocks.autoScrollState = {
      canAutoScroll: false,
      isAutoScrolling: false,
      isPaused: false,
    };
    container.config = {
      get: vi.fn(() => "0"),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      on: vi.fn(),
      off: vi.fn(),
      send: vi.fn(),
    };
    dispatchMock.mockReset();
    dragState.onDragEnd = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it("ドラッグ終了時に MOVE_TAB が dispatch される", () => {
    render(<TabBar />);

    // DragDropProvider の onDragEnd を直接呼び出してドラッグ完了をシミュレートする。
    // source.index は OptimisticSortingPlugin が確定したグループ内の最終位置を表す。
    dragState.onDragEnd?.({
      canceled: false,
      operation: {
        source: { id: "tab-1", index: 1, sortable: { initialIndex: 0 } },
        target: { id: "tab-2" },
      },
    });

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "MOVE_TAB",
      dragTabId: "tab-1",
      toIndex: 1,
    });
  });

  it("canceled なドラッグでは MOVE_TAB を dispatch しない", () => {
    render(<TabBar />);

    dragState.onDragEnd?.({
      canceled: true,
      operation: {
        source: { id: "tab-1" },
        target: { id: "tab-2" },
      },
    });

    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: "MOVE_TAB" }));
  });

  it("ドラッグ終了直後の click ではタブ選択を誤発火しない", () => {
    const { container } = render(<TabBar />);

    // ドラッグ完了イベントを発火して wasDraggingRef を立てる。
    dragState.onDragEnd?.({
      canceled: false,
      operation: {
        source: { id: "tab-1", index: 1, sortable: { initialIndex: 0 } },
        target: { id: "tab-2" },
      },
    });

    dispatchMock.mockClear();

    // ドラッグ直後の click は1回だけ抑止される。
    const tabs = container.querySelectorAll(".tab");
    fireEvent.click(tabs[1]);

    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SELECT_TAB" }));
  });
});

describe("TabBar detached tabs", () => {
  beforeEach(() => {
    mocks.tabStore.state = {
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "boardList", title: "ホーム" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null,
        },
        {
          id: "tab-2",
          history: [{ type: "boardList", title: "板一覧" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null,
        },
        {
          id: "tab-3",
          history: [{ type: "boardList", title: "板一覧2" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null,
        },
      ],
      selectedTabId: "tab-1",
      closedTabs: [],
    };
    mocks.detachedTabIds.add("tab-2");
    dispatchMock.mockReset();
    dragState.onDragEnd = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it("切り離し中のタブをタブバーとホイール切り替えから除外する", () => {
    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    expect(container.querySelector('[data-tab-id="tab-2"]')).not.toBeInTheDocument();

    fireEvent.wheel(tabBar, { deltaY: 40 });

    expect(dispatchMock).toHaveBeenCalledWith({ type: "SELECT_TAB", tabId: "tab-3" });
  });

  it("表示中の並び順を不可視タブ込みの保存位置へ変換する", () => {
    render(<TabBar />);

    dragState.onDragEnd?.({
      canceled: false,
      operation: {
        source: { id: "tab-1", index: 1, sortable: { initialIndex: 0 } },
        target: { id: "tab-3" },
      },
    });

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "MOVE_TAB",
      dragTabId: "tab-1",
      toIndex: 2,
    });
  });
});

describe("TabBar tab interactions", () => {
  beforeEach(() => {
    mocks.tabStore.state = {
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "boardList", title: "ホーム" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null as string | null,
        },
        {
          id: "tab-2",
          history: [{ type: "boardList", title: "板一覧" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null as string | null,
        },
      ],
      selectedTabId: "tab-1",
      closedTabs: [],
    };
    mocks.autoScrollState = {
      canAutoScroll: false,
      isAutoScrolling: false,
      isPaused: false,
    };
    container.config = {
      get: vi.fn(() => "0"),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      on: vi.fn(),
      off: vi.fn(),
      send: vi.fn(),
    };
    dispatchMock.mockReset();
    dragState.onDragEnd = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it("タブをクリックすると SELECT_TAB が dispatch される", () => {
    const { container } = render(<TabBar />);
    const tabs = container.querySelectorAll(".tab");

    fireEvent.click(tabs[1]);

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "SELECT_TAB",
      tabId: "tab-2",
    });
  });

  it("× ボタンをクリックすると CLOSE_TAB が dispatch される", () => {
    const { container } = render(<TabBar />);
    const closeBtn = container.querySelectorAll(".tab__close")[0] as HTMLButtonElement;

    fireEvent.click(closeBtn);

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "CLOSE_TAB",
      tabId: "tab-1",
      paneId: "pane-1",
    });
  });

  it("スレ一覧タブで自動更新が有効なとき、非アクティブ側に青い四角インジケーターを出す", () => {
    mocks.tabStore.state = {
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "boardList", title: "ホーム" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null as string | null,
        },
        {
          id: "tab-2",
          history: [
            {
              type: "threadList" as const,
              title: "板",
              boardUrl: "https://example.com/software/",
              boardTitle: "Software",
            },
          ],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: true,
          autoRefreshPageKey: "threadList:https://example.com/software/",
        },
      ],
      selectedTabId: "tab-1",
      closedTabs: [],
    } as typeof mocks.tabStore.state;

    const { container: rendered } = render(<TabBar />);
    const indicator = rendered.querySelector(
      "[data-tab-id='tab-2'] .tab__auto-refresh-indicator--inactive",
    );

    expect(indicator).not.toBeNull();
  });

  it("スレッドの追従開始と待機に応じてインジケーターを切り替える", () => {
    const page = {
      type: "thread",
      title: "スレッド",
      threadUrl: "https://example.com/test/read.cgi/board/1/",
    };
    mocks.tabStore.state.tabs[0] = {
      id: "tab-1",
      history: [page],
      currentIndex: 0,
      pinned: false,
      reloadKey: 0,
      autoRefreshEnabled: true,
      autoRefreshPageKey: "thread:https://example.com/test/read.cgi/board/1/",
    } as (typeof mocks.tabStore.state.tabs)[0];
    const { container: rendered, rerender } = render(<TabBar />);
    expect(rendered.querySelector(".tab__auto-refresh-indicator--inactive")).toBeInTheDocument();
    mocks.autoScrollState.canAutoScroll = true;
    rerender(<TabBar />);
    expect(rendered.querySelector(".tab__auto-refresh-indicator")).toHaveAttribute(
      "title",
      "自動更新: 動作中",
    );
    expect(
      rendered.querySelector(".tab__auto-refresh-indicator--inactive"),
    ).not.toBeInTheDocument();
  });
});

describe("TabBar bookmark", () => {
  afterEach(() => {
    cleanup();
  });

  it("現在ページのお気に入り操作をタブバーに表示しない", () => {
    const threadPage = {
      type: "thread" as const,
      title: "Current Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/1/",
    };

    mocks.tabStore.state = {
      tabs: [
        {
          id: "tab-1",
          history: [threadPage],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null,
        },
      ],
      selectedTabId: "tab-1",
      closedTabs: [],
    };

    render(<TabBar />);

    expect(document.querySelector(".tab-bar__bookmark")).toBeNull();
  });
});

setupTestPageTypes();
