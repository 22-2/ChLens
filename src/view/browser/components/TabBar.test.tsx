import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { TabBar } from "src/view/browser/components/TabBar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dispatchMock = vi.fn();

vi.mock("src/view/browser/components/ContextMenu", () => ({
  ContextMenu: () => null,
}));

vi.mock("src/view/browser/components/TabContextMenu", () => ({
  TabContextMenu: () => null,
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    state: {
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "home", title: "ホーム" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshThreadUrl: null,
        },
        {
          id: "tab-2",
          history: [{ type: "boardList", title: "板一覧" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshThreadUrl: null,
        },
      ],
      activeTabId: "tab-1",
      closedTabs: [],
    },
    dispatch: dispatchMock,
  }),
}));

describe("TabBar wheel switching", () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T00:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("deltaY が極小/0 のホイールではタブを切り替えない", () => {
    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    fireEvent.wheel(tabBar, { deltaY: 0 });
    fireEvent.wheel(tabBar, { deltaY: 4 });

    expect(dispatchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SELECT_TAB" }),
    );
  });

  it("短時間に連続したホイール入力では1回だけ切り替える", () => {
    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    fireEvent.wheel(tabBar, { deltaY: 40 });
    fireEvent.wheel(tabBar, { deltaY: 50 });

    const selectCalls = dispatchMock.mock.calls.filter(
      ([action]) => action?.type === "SELECT_TAB",
    );

    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0][0]).toEqual({ type: "SELECT_TAB", tabId: "tab-2" });
  });

  it("隣タブの中心線を越えた時だけリアルタイムに MOVE_TAB を dispatch する", () => {
    const { container } = render(<TabBar />);
    const tabs = container.querySelectorAll(".tab");
    const firstTab = tabs[0] as HTMLDivElement;
    const secondTab = tabs[1] as HTMLDivElement;

    vi.spyOn(firstTab, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 30,
      width: 100,
      height: 30,
      toJSON: () => ({}),
    });
    vi.spyOn(secondTab, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 0,
      top: 0,
      left: 100,
      right: 200,
      bottom: 30,
      width: 100,
      height: 30,
      toJSON: () => ({}),
    });

    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;
    vi.spyOn(tabBar, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 40,
      width: 300,
      height: 40,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(firstTab, {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    // 閾値超えだけではまだ移動せず、隣タブ中心(150px)を越えたら初めて入れ替わる。
    fireEvent.mouseMove(window, { clientX: 24, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 10 });

    expect(dispatchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "MOVE_TAB" }),
    );

    fireEvent.mouseMove(window, { clientX: 151, clientY: 10 });
    fireEvent.mouseUp(window);

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "MOVE_TAB",
      dragTabId: "tab-1",
      targetTabId: "tab-2",
    });
  });

  it("ドラッグで移動した直後の click ではタブ選択を誤発火しない", () => {
    const { container } = render(<TabBar />);
    const tabs = container.querySelectorAll(".tab");
    const firstTab = tabs[0] as HTMLDivElement;
    const secondTab = tabs[1] as HTMLDivElement;

    vi.spyOn(firstTab, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 30,
      width: 100,
      height: 30,
      toJSON: () => ({}),
    });
    vi.spyOn(secondTab, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 0,
      top: 0,
      left: 100,
      right: 200,
      bottom: 30,
      width: 100,
      height: 30,
      toJSON: () => ({}),
    });

    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;
    vi.spyOn(tabBar, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 40,
      width: 300,
      height: 40,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(firstTab, {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.mouseMove(window, { clientX: 24, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 151, clientY: 10 });
    fireEvent.mouseUp(window);

    dispatchMock.mockClear();

    fireEvent.click(secondTab);

    expect(dispatchMock).not.toHaveBeenCalledWith({
      type: "SELECT_TAB",
      tabId: "tab-2",
    });
  });
});
