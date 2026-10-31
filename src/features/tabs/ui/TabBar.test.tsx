import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabBar } from "src/features/tabs/ui/TabBar";
import { container } from "src/service-container/index";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import {
  dispatchMock,
  mocks,
  resizeObserverState,
  ResizeObserverStub,
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

describe("TabBar wheel switching", () => {
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
    resizeObserverState.callback = undefined;
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T00:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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

  it("共通タブバーでは表示中のタブにペインの印を付け、フォーカスのないペインは控えめにする", () => {
    const { container, rerender } = render(<TabBar sectionLabel="左" isPaneFocused />);
    const active = container.querySelector('[data-tab-id="tab-1"]') as HTMLDivElement;
    const inactive = container.querySelector('[data-tab-id="tab-2"]') as HTMLDivElement;

    expect(active.querySelector(".tab__pane-badge")).toHaveTextContent("左");
    expect(active).not.toHaveClass("tab--pane-unfocused");
    expect(inactive.querySelector(".tab__pane-badge")).toBeNull();

    rerender(<TabBar sectionLabel="左" isPaneFocused={false} />);
    expect(active).toHaveClass("tab--pane-unfocused");
  });

  it("単独のタブバーでは印を付けない", () => {
    const { container } = render(<TabBar />);
    expect(container.querySelector(".tab__pane-badge")).toBeNull();
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
    expect(menu).toHaveTextContent("タブバーを垂直にする");
    expect(menu.querySelectorAll("svg")).toHaveLength(3);

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
            history: [{ type: "boardList", title: "新しいタブ" }],
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

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains("tab-list")) {
        return { left: 0, right: 200, top: 0, bottom: 32, width: 200, height: 32 } as DOMRect;
      }
      return { left: 20, right: 180, top: 0, bottom: 32, width: 160, height: 32 } as DOMRect;
    });

    try {
      const { rerender } = render(<TabBar />);
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      mocks.tabStore.state = { ...mocks.tabStore.state, selectedTabId: "tab-2" };
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

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains("tab-list")) {
        return { left: 0, right: 200, top: 0, bottom: 32, width: 200, height: 32 } as DOMRect;
      }
      return this.dataset.tabId === "tab-2"
        ? ({ left: 201, right: 361, top: 0, bottom: 32, width: 160, height: 32 } as DOMRect)
        : ({ left: 20, right: 180, top: 0, bottom: 32, width: 160, height: 32 } as DOMRect);
    });

    try {
      const { rerender } = render(<TabBar />);
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      mocks.tabStore.state = { ...mocks.tabStore.state, selectedTabId: "tab-2" };
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

  it("ウィンドウのリサイズで見切れたアクティブタブを表示する", () => {
    const scrollIntoViewMock = vi.fn();
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    )?.value;
    const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "getBoundingClientRect",
    )?.value;
    let activeTabIsOutside = false;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains("tab-list")) {
        return { left: 0, right: 200, top: 0, bottom: 32, width: 200, height: 32 } as DOMRect;
      }
      return activeTabIsOutside && this.dataset.tabId === "tab-1"
        ? ({ left: -1, right: 159, top: 0, bottom: 32, width: 160, height: 32 } as DOMRect)
        : ({ left: 20, right: 180, top: 0, bottom: 32, width: 160, height: 32 } as DOMRect);
    });

    try {
      render(<TabBar />);
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      fireEvent.resize(window);
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      activeTabIsOutside = true;
      fireEvent.resize(window);
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

  it("ResizeObserverでタブ幅が変わったときも見切れたアクティブタブを表示する", () => {
    const scrollIntoViewMock = vi.fn();
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    )?.value;
    const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "getBoundingClientRect",
    )?.value;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains("tab-list")) {
        return { left: 0, right: 200, top: 0, bottom: 32, width: 200, height: 32 } as DOMRect;
      }
      return this.dataset.tabId === "tab-1"
        ? ({ left: 201, right: 361, top: 0, bottom: 32, width: 160, height: 32 } as DOMRect)
        : ({ left: 20, right: 180, top: 0, bottom: 32, width: 160, height: 32 } as DOMRect);
    });

    try {
      render(<TabBar />);
      scrollIntoViewMock.mockClear();

      resizeObserverState.callback?.();

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
      selectedTabId: "tab-2",
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
      selectedTabId: "tab-2",
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

setupTestPageTypes();
