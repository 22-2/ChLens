import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import {
  AutoScrollPaneStatesProvider,
  AutoScrollStateProvider,
  useSetAutoScrollState,
} from "src/features/auto-refresh/browser/use-auto-scroll-state";
import { SharedTabBar } from "src/features/tabs/ui/SharedTabBar";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/view/browser/state/tabs/use-tab-store", async () => {
  const { createContext, useContext } = await import("react");
  const PaneContext = createContext("first");
  const panes = ["first", "second"].map((id) => {
    const url = `https://example.com/test/read.cgi/${id}/1/`;
    return {
      id,
      activeTabId: `tab-${id}`,
      tabs: [
        {
          id: `tab-${id}`,
          history: [{ type: "thread", title: id, threadUrl: url }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: true,
          autoRefreshPageKey: `thread:${url}`,
        },
      ],
    };
  });
  return {
    PaneProvider: ({ paneId, children }: { paneId: string; children: React.ReactNode }) => (
      <PaneContext.Provider value={paneId}>{children}</PaneContext.Provider>
    ),
    useTabPanes: () => ({ panes, activePaneId: "first" }),
    useTabStore: () => {
      const paneId = useContext(PaneContext);
      const pane = panes.find((item) => item.id === paneId)!;
      return {
        paneId,
        state: { tabs: pane.tabs, selectedTabId: pane.activeTabId, closedTabs: [] },
        stateRef: { current: { panes, activePaneId: "first" } },
        dispatch: vi.fn(),
      };
    },
  };
});
vi.mock("src/features/tabs/browser/use-detached-tab-controller", () => ({
  useDetachedTabController: () => ({ isDetachedTab: () => false }),
}));
vi.mock("src/features/tabs/browser/use-tab-bar-orientation", () => ({
  TAB_BAR_ORIENTATION_CONFIG_KEY: "orientation",
  useVerticalTabBarLayout: () => ({
    collapsed: false,
    width: 208,
    setCollapsed: vi.fn(),
    setWidth: vi.fn(),
  }),
}));
vi.mock("src/features/tabs/browser/use-tab-command-runner", () => ({
  useTabCommandRunner: () => vi.fn(),
}));
vi.mock("src/features/tabs/ui/TabContextMenu", () => ({ TabContextMenu: () => null }));
vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({
    ref: vi.fn(),
    isDragSource: false,
    isDropTarget: false,
    isDragging: false,
    isDropping: false,
  }),
  isSortableOperation: () => false,
}));

function Controls({ paneId }: { paneId: string }) {
  const setState = useSetAutoScrollState();
  return (
    <>
      <button
        onClick={() => setState({ canAutoScroll: true, isAutoScrolling: false, isPaused: false })}
      >
        {paneId} 追従
      </button>
      <button
        onClick={() => setState({ canAutoScroll: false, isAutoScrolling: false, isPaused: false })}
      >
        {paneId} 待機
      </button>
    </>
  );
}

describe("共通タブバーの自動更新表示", () => {
  it("各ペインの追従開始と待機をそれぞれのタブへ反映する", () => {
    const { container } = render(
      <AutoScrollPaneStatesProvider>
        <SharedTabBar orientation="vertical" />
        <AutoScrollStateProvider paneId="first">
          <Controls paneId="first" />
        </AutoScrollStateProvider>
        <AutoScrollStateProvider paneId="second">
          <Controls paneId="second" />
        </AutoScrollStateProvider>
      </AutoScrollPaneStatesProvider>,
    );
    const indicator = (paneId: string) =>
      container.querySelector(`[data-tab-id="tab-${paneId}"] .tab__auto-refresh-indicator`);
    expect(indicator("first")).toHaveAttribute("title", "自動更新: 待機中");
    expect(indicator("second")).toHaveAttribute("title", "自動更新: 待機中");
    fireEvent.click(screen.getByRole("button", { name: "first 追従" }));
    expect(indicator("first")).toHaveAttribute("title", "自動更新: 動作中");
    expect(indicator("second")).toHaveAttribute("title", "自動更新: 待機中");
    fireEvent.click(screen.getByRole("button", { name: "second 追従" }));
    fireEvent.click(screen.getByRole("button", { name: "first 待機" }));
    expect(indicator("first")).toHaveAttribute("title", "自動更新: 待機中");
    expect(indicator("second")).toHaveAttribute("title", "自動更新: 動作中");
    fireEvent.click(screen.getByRole("button", { name: "second 待機" }));
    expect(indicator("second")).toHaveAttribute("title", "自動更新: 待機中");
  });
});

setupTestPageTypes();
