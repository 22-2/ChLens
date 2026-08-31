import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { container } from "src/service-container/index";
import { TabBar } from "src/view/browser/components/TabBar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const dispatchMock = vi.fn();
const mocks = vi.hoisted(() => ({
  tabStore: {
    state: {
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "home", title: "ホーム" }],
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
      activeTabId: "tab-1",
      closedTabs: [],
    },
  },
  autoScrollState: {
    canAutoScroll: false,
    isAutoScrolling: false,
    isPaused: false,
  },
}));

vi.mock("src/view/browser/ui/ContextMenu", () => ({
  ContextMenu: ({
    items,
  }: {
    items: Array<{ id: string; label?: string; icon?: React.ReactNode }>;
  }) => (
    <div data-testid="bar-context-menu">
      {items.map((item) => (
        <span key={item.id} data-menu-item={item.id}>
          {item.icon}
          {item.label}
        </span>
      ))}
    </div>
  ),
}));

vi.mock("src/view/browser/components/TabContextMenu", () => ({
  TabContextMenu: () => null,
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    state: mocks.tabStore.state,
    // 本物同様、ホイールハンドラが常に最新 state を同期参照できる ref を模す。
    // stateRef はグローバル状態（panes 配列）を指すので、単一ペインに包んで返す。
    stateRef: {
      get current() {
        const slice = mocks.tabStore.state;
        return {
          panes: [
            {
              id: "pane-1",
              tabs: slice.tabs,
              activeTabId: slice.activeTabId,
            },
          ],
          activePaneId: "pane-1",
          closedTabs: slice.closedTabs,
        };
      },
    },
    dispatch: dispatchMock,
    paneId: "pane-1",
  }),
}));

vi.mock("src/view/browser/hooks/use-auto-scroll-state", () => ({
  useAutoScrollState: () => mocks.autoScrollState,
}));

// DragDropProvider はテスト環境ではシムで置き換え、onDragEnd を外部から呼べるようにする。
let capturedOnDragEnd: ((event: Record<string, unknown>) => void) | undefined;

vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd?: (event: Record<string, unknown>) => void;
  }) => {
    capturedOnDragEnd = onDragEnd;
    return <>{children}</>;
  },
}));

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: ({ id: _id }: { id: string; index: number; group?: string }) => ({
    // ref は DOM アタッチ不要なためノーオプとして返す。
    ref: vi.fn(),
    isDragSource: false,
    isDropTarget: false,
    isDragging: false,
    isDropping: false,
  }),
  // テスト用モックでは operation が object であれば sortable 操作として扱う。
  isSortableOperation: (op: unknown) => op !== null && typeof op === "object",
}));

describe("TabBar wheel switching", () => {
  beforeEach(() => {
    mocks.tabStore.state = {
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "home", title: "ホーム" }],
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
      activeTabId: "tab-1",
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T00:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("タブのホバー位置から離れた位置に共通ツールチップを表示する", () => {
    const { container } = render(<TabBar />);
    const tab = container.querySelector('[data-tab-id="tab-1"]') as HTMLDivElement;

    fireEvent.mouseEnter(tab, { clientX: 100, clientY: 80 });

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("ホーム");
    expect(tooltip).toHaveStyle({ left: "116px", top: "96px" });

    fireEvent.mouseLeave(tab);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("deltaY が極小/0 のホイールではタブを切り替えない", () => {
    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    fireEvent.wheel(tabBar, { deltaY: 0 });
    fireEvent.wheel(tabBar, { deltaY: 1 });
    fireEvent.wheel(tabBar, { deltaX: 0.5, deltaY: 0.5 });

    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SELECT_TAB" }));
  });

  it("タブ列があふれていてもホイールでアクティブタブを切り替える", () => {
    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;
    const tabList = container.querySelector(".tab-list") as HTMLDivElement;
    Object.defineProperties(tabList, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 500 },
    });
    tabList.scrollLeft = 100;

    fireEvent.wheel(tabBar, { deltaY: 40 });

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "SELECT_TAB",
      tabId: "tab-2",
    });
    expect(tabList.scrollLeft).toBe(100);
  });

  it("あふれたタブ列の右端では下方向ホイールで次のタブへ切り替える", () => {
    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;
    const tabList = container.querySelector(".tab-list") as HTMLDivElement;
    Object.defineProperties(tabList, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 500 },
    });
    tabList.scrollLeft = 300;

    fireEvent.wheel(tabBar, { deltaY: 40 });

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "SELECT_TAB",
      tabId: "tab-2",
    });
  });

  it("あふれたタブ列の左端では下方向ホイールでも次のタブへ切り替える", () => {
    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;
    const tabList = container.querySelector(".tab-list") as HTMLDivElement;
    Object.defineProperties(tabList, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 500 },
    });
    tabList.scrollLeft = 0;

    fireEvent.wheel(tabBar, { deltaY: 40 });

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "SELECT_TAB",
      tabId: "tab-2",
    });
  });

  it("タブ追加ボタンは通常は最後のタブの直後、タブが溢れたときは右端に固定される", () => {
    const { container } = render(<TabBar />);
    const tabList = container.querySelector(".tab-list") as HTMLDivElement;
    const addButton = container.querySelector(".tab-bar__add") as HTMLButtonElement;

    expect(tabList.querySelector(".tab-bar__add")).toBe(addButton);
    expect(addButton).toHaveAttribute("aria-label", "新しいタブ");

    Object.defineProperties(tabList, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 500 },
    });
    fireEvent.scroll(tabList);

    expect(tabList.querySelector(".tab-bar__add")).toBeNull();
    expect(container.querySelector(".tab-bar > .tab-bar__add")).toBeInTheDocument();
  });

  it("タブ列のスクロール可能方向をフェード表示へ反映する", () => {
    const { container } = render(<TabBar />);
    const tabList = container.querySelector(".tab-list") as HTMLDivElement;
    const tabListContainer = container.querySelector(".tab-list-container") as HTMLDivElement;
    Object.defineProperties(tabList, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 500 },
    });

    fireEvent.scroll(tabList);
    expect(tabListContainer).toHaveClass("tab-list-container--can-scroll-right");
    expect(tabListContainer).not.toHaveClass("tab-list-container--can-scroll-left");

    tabList.scrollLeft = 100;
    fireEvent.scroll(tabList);
    expect(tabListContainer).toHaveClass("tab-list-container--can-scroll-left");
    expect(tabListContainer).toHaveClass("tab-list-container--can-scroll-right");

    tabList.scrollLeft = 300;
    fireEvent.scroll(tabList);
    expect(tabListContainer).toHaveClass("tab-list-container--can-scroll-left");
    expect(tabListContainer).not.toHaveClass("tab-list-container--can-scroll-right");
  });

  it("タブバーの背景メニューにアイコンを表示し、仮想メニューイベントを誤認しない", () => {
    const firstRender = render(<TabBar />);
    const { container } = firstRender;
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    fireEvent.contextMenu(tabBar, { clientX: 20, clientY: 20 });

    const menu = screen.getByTestId("bar-context-menu");
    expect(menu).toHaveTextContent("新しいタブを開く");
    expect(menu).toHaveTextContent("閉じたタブを開く");
    expect(menu.querySelectorAll("svg")).toHaveLength(2);

    firstRender.unmount();
    const rerenderedTabBar = render(<TabBar />).container.querySelector(
      ".tab-bar",
    ) as HTMLDivElement;
    const virtualTrigger = document.createElement("span");
    virtualTrigger.dataset.contextMenuTrigger = "true";
    rerenderedTabBar.appendChild(virtualTrigger);
    fireEvent.contextMenu(virtualTrigger, { clientX: 30, clientY: 30 });

    expect(screen.queryByTestId("bar-context-menu")).toBeNull();
  });

  it("バックグラウンドで新規タブが追加されても追加位置までスクロールする", () => {
    const scrollIntoViewMock = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });

    try {
      const { container, rerender } = render(<TabBar />);
      scrollIntoViewMock.mockClear();
      mocks.tabStore.state = {
        ...mocks.tabStore.state,
        tabs: [
          ...mocks.tabStore.state.tabs,
          {
            id: "tab-3",
            history: [{ type: "home", title: "新しいタブ" }],
            currentIndex: 0,
            pinned: false,
            reloadKey: 0,
            autoRefreshEnabled: false,
            autoRefreshPageKey: null,
          },
        ],
      };

      rerender(<TabBar />);

      const newTab = container.querySelector('[data-tab-id="tab-3"]');
      expect(scrollIntoViewMock.mock.instances).toContain(newTab);
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        block: "nearest",
        inline: "nearest",
      });
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
    }
  });

  it("アクティブタブが見えている間はタブバーをスクロールしない", () => {
    const scrollIntoViewMock = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.classList.contains("tab-list")) {
          return { left: 0, right: 200, top: 0, bottom: 32, width: 200, height: 32 } as DOMRect;
        }
        return { left: 20, right: 180, top: 0, bottom: 32, width: 160, height: 32 } as DOMRect;
      },
    );

    try {
      const { rerender } = render(<TabBar />);
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      mocks.tabStore.state = { ...mocks.tabStore.state, activeTabId: "tab-2" };
      rerender(<TabBar />);

      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value: originalGetBoundingClientRect,
      });
    }
  });

  it("アクティブタブがビューポート外へ切り替わったときだけスクロールする", () => {
    const scrollIntoViewMock = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.classList.contains("tab-list")) {
          return { left: 0, right: 200, top: 0, bottom: 32, width: 200, height: 32 } as DOMRect;
        }
        return this.dataset.tabId === "tab-2"
          ? ({ left: 201, right: 361, top: 0, bottom: 32, width: 160, height: 32 } as DOMRect)
          : ({ left: 20, right: 180, top: 0, bottom: 32, width: 160, height: 32 } as DOMRect);
      },
    );

    try {
      const { rerender } = render(<TabBar />);
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      mocks.tabStore.state = { ...mocks.tabStore.state, activeTabId: "tab-2" };
      rerender(<TabBar />);

      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        block: "nearest",
        inline: "nearest",
      });
    } finally {
      vi.restoreAllMocks();
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value: originalGetBoundingClientRect,
      });
    }
  });

  it("短時間に連続したホイール入力では1回だけ切り替える", () => {
    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    // normalize-wheel では deltaY > 0 が下スクロールとして正規化される。
    fireEvent.wheel(tabBar, { deltaY: 40 });
    fireEvent.wheel(tabBar, { deltaY: 50 });

    const selectCalls = dispatchMock.mock.calls.filter(([action]) => action?.type === "SELECT_TAB");

    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0][0]).toEqual({ type: "SELECT_TAB", tabId: "tab-2" });
  });

  it("最後のタブで下方向へ回すと先頭へ循環する", () => {
    mocks.tabStore.state = {
      ...mocks.tabStore.state,
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "home", title: "ホーム" }],
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
      activeTabId: "tab-2",
    };

    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    // normalize-wheel では deltaY > 0 が下スクロール→ 次のタブへ（循環して先頭へ）。
    fireEvent.wheel(tabBar, { deltaY: 40 });

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "SELECT_TAB",
      tabId: "tab-1",
    });
  });

  it("横成分込みのホイール方向で前のタブへ切り替える", () => {
    mocks.tabStore.state = {
      ...mocks.tabStore.state,
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "home", title: "ホーム" }],
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
      activeTabId: "tab-2",
    };

    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    // normalize-wheel では deltaX < 0 を左方向として扱い、前のタブへ進む。
    fireEvent.wheel(tabBar, { deltaX: -2, deltaY: 0 });

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "SELECT_TAB",
      tabId: "tab-1",
    });
  });

  it("先頭のタブで上方向へ回すと最後尾へ循環する", () => {
    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    // normalize-wheel では deltaY < 0 が上スクロール（前のタブへ）→ 最後尾へ循環。
    fireEvent.wheel(tabBar, { deltaY: -40 });

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "SELECT_TAB",
      tabId: "tab-2",
    });
  });
});

describe("TabBar drag-to-reorder", () => {
  beforeEach(() => {
    mocks.tabStore.state = {
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "home", title: "ホーム" }],
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
      activeTabId: "tab-1",
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
    capturedOnDragEnd = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it("ドラッグ終了時に MOVE_TAB が dispatch される", () => {
    render(<TabBar />);

    // DragDropProvider の onDragEnd を直接呼び出してドラッグ完了をシミュレートする。
    // source.index は OptimisticSortingPlugin が確定したグループ内の最終位置を表す。
    capturedOnDragEnd?.({
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

    capturedOnDragEnd?.({
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
    capturedOnDragEnd?.({
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

describe("TabBar tab interactions", () => {
  beforeEach(() => {
    mocks.tabStore.state = {
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "home", title: "ホーム" }],
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
      activeTabId: "tab-1",
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
    capturedOnDragEnd = undefined;
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

  it("更新ボタンをタブバー左端から押すと RELOAD が dispatch される", () => {
    mocks.tabStore.state = {
      ...mocks.tabStore.state,
      tabs: [
        {
          ...mocks.tabStore.state.tabs[0],
          history: [
            {
              type: "thread",
              title: "スレッド",
              threadUrl: "https://example.com/test/read.cgi/software/1/",
            },
          ],
        },
      ],
      activeTabId: "tab-1",
    } as unknown as typeof mocks.tabStore.state;

    const { container } = render(<TabBar />);
    const refreshButton = container.querySelector(".tab-bar__refresh") as HTMLButtonElement;

    expect(refreshButton).not.toBeDisabled();
    fireEvent.click(refreshButton);

    expect(dispatchMock).toHaveBeenCalledWith({ type: "RELOAD" });
  });

  it("× ボタンをクリックすると CLOSE_TAB が dispatch される", () => {
    const { container } = render(<TabBar />);
    const closeBtn = container.querySelectorAll(".tab__close")[0] as HTMLButtonElement;

    fireEvent.click(closeBtn);

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "CLOSE_TAB",
      tabId: "tab-1",
    });
  });

  it("スレ一覧タブで自動更新が有効なとき、非アクティブ側に青い四角インジケーターを出す", () => {
    mocks.tabStore.state = {
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "home", title: "ホーム" }],
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
      activeTabId: "tab-1",
      closedTabs: [],
    } as typeof mocks.tabStore.state;

    const { container: rendered } = render(<TabBar />);
    const indicator = rendered.querySelector(
      "[data-tab-id='tab-2'] .tab__auto-refresh-indicator--inactive",
    );

    expect(indicator).not.toBeNull();
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
      activeTabId: "tab-1",
      closedTabs: [],
    };

    render(<TabBar />);

    expect(document.querySelector(".tab-bar__bookmark")).toBeNull();
  });
});
