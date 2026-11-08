import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { SharedTabBar } from "src/features/tabs/ui/SharedTabBar";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  panes: [{ id: "pane-1" }, { id: "pane-2" }] as Array<{ id: string }>,
  activePaneId: "pane-2",
  dispatch: vi.fn(),
  tabs: [] as Array<{
    id: string;
    history: Array<{ type: "settings"; title: string }>;
    currentIndex: number;
    pinned: boolean;
    reloadKey: number;
    autoRefreshEnabled: boolean;
    autoRefreshPageKey: null;
  }>,
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useWindowPanes: () => ({ panes: mocks.panes, activePaneId: mocks.activePaneId }),
  useTabStore: () => ({ state: { tabs: mocks.tabs }, dispatch: mocks.dispatch }),
  PaneProvider: ({ paneId, children }: { paneId: string; children: React.ReactNode }) => (
    <div data-pane-provider={paneId}>{children}</div>
  ),
}));

vi.mock("src/features/tabs/ui/TabBar", () => ({
  TabBar: ({
    sectionLabel,
    isPaneFocused,
    embedded,
    extraSections,
    footer,
  }: {
    sectionLabel?: string;
    isPaneFocused?: boolean;
    embedded?: boolean;
    extraSections?: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div
      data-testid={embedded ? "embedded-bar" : "main-bar"}
      data-label={sectionLabel ?? ""}
      data-focused={String(isPaneFocused)}
    >
      {extraSections}
      {footer}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  mocks.panes = [{ id: "pane-1" }, { id: "pane-2" }];
  mocks.activePaneId = "pane-2";
  mocks.tabs = [];
  mocks.dispatch.mockReset();
});

describe("SharedTabBar", () => {
  it("設定ボタンをフォーカス中のペインに配置し、設定を開く", () => {
    render(<SharedTabBar orientation="vertical" />);
    const button = screen.getByRole("button", { name: "設定を開く" });
    expect(button.closest('[data-pane-provider="pane-2"]')).not.toBeNull();
    fireEvent.click(button);
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "OPEN_IN_NEW_TAB_FORCE" }),
    );
  });

  it("設定タブが開いていれば再利用する", () => {
    mocks.tabs = [
      {
        id: "settings",
        history: [{ type: "settings", title: "設定" }],
        currentIndex: 0,
        pinned: false,
        reloadKey: 0,
        autoRefreshEnabled: false,
        autoRefreshPageKey: null,
      },
    ];
    render(<SharedTabBar orientation="vertical" />);
    fireEvent.click(screen.getByRole("button", { name: "設定を開く" }));
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: "SELECT_TAB", tabId: "settings" });
  });
  it("2ペインでは左・右の見出しを付け、フォーカス中のペインを示す", () => {
    render(<SharedTabBar orientation="vertical" />);

    const main = screen.getByTestId("main-bar");
    const embedded = screen.getByTestId("embedded-bar");
    expect(main).toHaveAttribute("data-label", "左");
    expect(main).toHaveAttribute("data-focused", "false");
    expect(embedded).toHaveAttribute("data-label", "右");
    expect(embedded).toHaveAttribute("data-focused", "true");
    // 2つ目以降のペインは、先頭ペインのタブバーの中に並べる。
    expect(main).toContainElement(embedded);
  });

  it("1ペインでは見出しを付けない", () => {
    mocks.panes = [{ id: "pane-1" }];
    mocks.activePaneId = "pane-1";
    render(<SharedTabBar orientation="horizontal" />);

    expect(screen.getByTestId("main-bar")).toHaveAttribute("data-label", "");
    expect(screen.queryByTestId("embedded-bar")).toBeNull();
  });

  it("3ペイン以上は番号付きの見出しにする", () => {
    mocks.panes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    render(<SharedTabBar orientation="vertical" />);

    expect(screen.getByTestId("main-bar")).toHaveAttribute("data-label", "ペイン 1");
    expect(screen.getAllByTestId("embedded-bar").map((el) => el.dataset.label)).toEqual([
      "ペイン 2",
      "ペイン 3",
    ]);
  });
});
