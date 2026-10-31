import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabBar } from "src/features/tabs/ui/TabBar";
import { container } from "src/service-container/index";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import {
  dispatchMock,
  mocks,
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

describe("TabBar vertical", () => {
  const configSetMock = vi.fn();
  let configValues: Record<string, string>;

  beforeEach(() => {
    configSetMock.mockReset();
    configValues = { tab_bar_width: "208" };
    container.config = {
      get: vi.fn((key: string) => configValues[key] ?? "0"),
      set: configSetMock,
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      on: vi.fn(),
      off: vi.fn(),
      send: vi.fn(),
    };
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
    dispatchMock.mockReset();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("垂直では縦配置クラスと縦方向のtablist属性が付く", () => {
    const { container } = render(<TabBar orientation="vertical" />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;
    const tabList = container.querySelector(".tab-list") as HTMLDivElement;

    expect(tabBar).toHaveClass("tab-bar--vertical");
    expect(tabList).toHaveAttribute("aria-orientation", "vertical");
    expect(tabList).toHaveAttribute("role", "tablist");
  });

  it("水平・垂直どちらでも更新ボタンを置かずタイトルバーへ集約する", () => {
    const { container, rerender } = render(<TabBar orientation="horizontal" />);

    expect(container.querySelector(".tab-bar__refresh")).toBeNull();

    rerender(<TabBar orientation="vertical" />);

    expect(container.querySelector(".tab-bar__refresh")).toBeNull();
    expect(container.querySelector(".tab-bar__collapse")).not.toBeNull();
  });

  it("垂直ではタブ上の閉じるボタンを表示しない", () => {
    const { container } = render(<TabBar orientation="vertical" />);

    expect(container.querySelector(".tab__close")).toBeNull();
  });

  it("垂直では追加ボタンが最終タブの直後にある", () => {
    const { container } = render(<TabBar orientation="vertical" />);
    const tabList = container.querySelector(".tab-list") as HTMLDivElement;
    const addButton = tabList.querySelector(".tab-bar__add") as HTMLButtonElement;

    expect(addButton).not.toBeNull();
    expect(tabList.lastElementChild).toBe(addButton);

    Object.defineProperties(tabList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });
    fireEvent.scroll(tabList);

    expect(tabList.lastElementChild).toBe(addButton);
  });

  it("垂直ではスクロール可能な間でもホイールで一覧をスクロールせず、タブを切り替える", () => {
    const { container } = render(<TabBar orientation="vertical" />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;
    const tabList = container.querySelector(".tab-list") as HTMLDivElement;
    Object.defineProperties(tabList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });
    tabList.scrollTop = 0;

    const wheelEvent = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true });
    tabBar.dispatchEvent(wheelEvent);

    // 既定のスクロールを止めたうえで、ホイールはタブ切り替えだけに使う。
    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: "SELECT_TAB" }));
  });

  it("垂直ではスクロール端やスクロール不要時はホイールでタブを切り替える", () => {
    const { container } = render(<TabBar orientation="vertical" />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;
    const tabList = container.querySelector(".tab-list") as HTMLDivElement;
    Object.defineProperties(tabList, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 500 },
    });
    tabList.scrollTop = 0;

    fireEvent.wheel(tabBar, { deltaY: 40 });

    expect(dispatchMock).toHaveBeenCalledWith({ type: "SELECT_TAB", tabId: "tab-2" });
  });

  it("垂直では下端到達後の下方向ホイールで次のタブへ切り替える", () => {
    const { container } = render(<TabBar orientation="vertical" />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;
    const tabList = container.querySelector(".tab-list") as HTMLDivElement;
    Object.defineProperties(tabList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });
    tabList.scrollTop = 400;

    fireEvent.wheel(tabBar, { deltaY: 40 });

    expect(dispatchMock).toHaveBeenCalledWith({ type: "SELECT_TAB", tabId: "tab-2" });
  });

  it("垂直では上下のスクロール可能方向をフェード表示へ反映する", () => {
    const { container } = render(<TabBar orientation="vertical" />);
    const tabList = container.querySelector(".tab-list") as HTMLDivElement;
    const tabListContainer = container.querySelector(".tab-list-container") as HTMLDivElement;
    Object.defineProperties(tabList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
    });

    fireEvent.scroll(tabList);
    expect(tabListContainer).toHaveClass("tab-list-container--can-scroll-bottom");
    expect(tabListContainer).not.toHaveClass("tab-list-container--can-scroll-top");

    tabList.scrollTop = 200;
    fireEvent.scroll(tabList);
    expect(tabListContainer).toHaveClass("tab-list-container--can-scroll-top");
    expect(tabListContainer).toHaveClass("tab-list-container--can-scroll-bottom");

    tabList.scrollTop = 400;
    fireEvent.scroll(tabList);
    expect(tabListContainer).toHaveClass("tab-list-container--can-scroll-top");
    expect(tabListContainer).not.toHaveClass("tab-list-container--can-scroll-bottom");
  });

  it("垂直では上下矢印キーでタブを移動できる", () => {
    const { container } = render(<TabBar orientation="vertical" />);
    const firstTab = container.querySelector('[data-tab-id="tab-1"]') as HTMLDivElement;

    fireEvent.keyDown(firstTab, { key: "ArrowDown" });

    expect(dispatchMock).toHaveBeenCalledWith({ type: "SELECT_TAB", tabId: "tab-2" });
    expect(document.activeElement?.getAttribute("data-tab-id")).toBe("tab-2");

    fireEvent.keyDown(document.activeElement as HTMLDivElement, { key: "ArrowUp" });

    expect(dispatchMock).toHaveBeenCalledWith({ type: "SELECT_TAB", tabId: "tab-1" });
  });

  it("水平では左右矢印キーでタブを移動できる", () => {
    const { container } = render(<TabBar orientation="horizontal" />);
    const firstTab = container.querySelector('[data-tab-id="tab-1"]') as HTMLDivElement;

    fireEvent.keyDown(firstTab, { key: "ArrowRight" });

    expect(dispatchMock).toHaveBeenCalledWith({ type: "SELECT_TAB", tabId: "tab-2" });
  });

  it("背景メニューからタブバーを垂直に切り替えられる", () => {
    const { container } = render(<TabBar orientation="horizontal" />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    fireEvent.contextMenu(tabBar, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByText("タブバーを垂直にする"));

    expect(configSetMock).toHaveBeenCalledWith("tab_bar_orientation", "vertical");
  });

  it("背景メニューからタブバーを水平に戻せる", () => {
    const { container } = render(<TabBar orientation="vertical" />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    fireEvent.contextMenu(tabBar, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByText("タブバーを水平にする"));

    expect(configSetMock).toHaveBeenCalledWith("tab_bar_orientation", "horizontal");
  });

  it("簡易表示ではタイトルを隠してアイコンを表示する", () => {
    configValues["tab_bar_collapsed"] = "on";
    const { container } = render(<TabBar orientation="vertical" />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    expect(tabBar).toHaveClass("tab-bar--collapsed");
    expect(container.querySelector(".tab__title")).toBeNull();
    expect(container.querySelectorAll(".tab__icon svg")).toHaveLength(2);
    expect(container.querySelector(".tab-bar__resize-handle")).not.toBeNull();
  });

  it("簡易表示の切り替えを保存する", () => {
    const { container } = render(<TabBar orientation="vertical" />);
    const toggle = container.querySelector(".tab-bar__collapse") as HTMLButtonElement;

    expect(toggle).toHaveAttribute("aria-label", "簡易表示にする");
    expect(toggle.querySelector("svg")).toHaveAttribute("width", "14");

    fireEvent.click(toggle);

    expect(configSetMock).toHaveBeenCalledWith("tab_bar_collapsed", "on");
  });

  it("幅変更ハンドルのドラッグで幅を変えて確定時に保存する", () => {
    const { container } = render(<TabBar orientation="vertical" />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;
    const handle = container.querySelector(".tab-bar__resize-handle") as HTMLDivElement;

    expect(tabBar).toHaveStyle({ width: "208px" });

    fireEvent.pointerDown(handle, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 240, pointerId: 1 });

    expect(tabBar).toHaveStyle({ width: "248px" });
    expect(configSetMock).not.toHaveBeenCalled();

    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(configSetMock).toHaveBeenCalledWith("tab_bar_width", "248");
    expect(tabBar).toHaveStyle({ width: "248px" });
  });

  it("幅は160pxから280pxの範囲に収める", () => {
    const { container } = render(<TabBar orientation="vertical" />);
    const handle = container.querySelector(".tab-bar__resize-handle") as HTMLDivElement;

    fireEvent.pointerDown(handle, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 600, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(configSetMock).toHaveBeenCalledWith("tab_bar_width", "280");

    fireEvent.pointerDown(handle, { clientX: 600, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(configSetMock).toHaveBeenCalledWith("tab_bar_width", "160");
  });

  it("縮小中もハンドルがあり右へ引くと展開へ移る", () => {
    configValues["tab_bar_collapsed"] = "on";
    const { container } = render(<TabBar orientation="vertical" />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;
    const handle = container.querySelector(".tab-bar__resize-handle") as HTMLDivElement;

    expect(handle).not.toBeNull();

    fireEvent.pointerDown(handle, { clientX: 48, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 248, pointerId: 1 });

    expect(tabBar).toHaveStyle({ width: "248px" });

    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(configSetMock).toHaveBeenCalledWith("tab_bar_collapsed", "off");
    expect(configSetMock).toHaveBeenCalledWith("tab_bar_width", "248");
  });

  it("縮小中の小さなドラッグでは縮小のまま戻る", () => {
    configValues["tab_bar_collapsed"] = "on";
    const { container } = render(<TabBar orientation="vertical" />);
    const handle = container.querySelector(".tab-bar__resize-handle") as HTMLDivElement;

    fireEvent.pointerDown(handle, { clientX: 48, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 58, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(configSetMock).not.toHaveBeenCalled();
  });
});

setupTestPageTypes();
