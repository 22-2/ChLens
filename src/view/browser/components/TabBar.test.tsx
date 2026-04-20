import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabBar } from "src/view/browser/components/TabBar";

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
});
