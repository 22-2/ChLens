import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { TabWindowHost } from "src/view/browser/components/TabWindowHost";
import { useDetachedTabController } from "src/view/browser/hooks/use-detached-tab-controller";
import type { Pane, Tab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  panes: [] as Pane[],
  openAuxiliaryWindow: vi.fn(),
  tabDispatch: vi.fn(),
  fakeWindow: null as Window | null,
  root: null as HTMLElement | null,
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  PaneProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTabDispatch: () => mocks.tabDispatch,
  useTabDispatchForTab: () => vi.fn(),
  useTabPanes: () => ({ panes: mocks.panes, activePaneId: "pane-1" }),
  // 別窓の共通タイトル・ステータスを描画するため、テスト用にも表示タブのスライスを渡す。
  useTabStore: () => {
    const tab = mocks.panes[0]?.tabs[0];
    if (!tab) {
      throw new Error("テスト用のタブがありません");
    }
    return {
      state: { tabs: [tab], selectedTabId: tab.id, closedTabs: [] },
      stateRef: { current: { panes: mocks.panes, activePaneId: "pane-1", closedTabs: [] } },
      dispatch: vi.fn(),
      viewTab: tab,
      viewPage: tab.history[tab.currentIndex],
      paneId: "pane-1",
    };
  },
}));

vi.mock("src/view/browser/hooks/use-auxiliary-window", () => ({
  openAuxiliaryWindow: mocks.openAuxiliaryWindow,
}));

vi.mock("src/view/browser/hooks/use-theme", () => ({
  useTheme: () => "light",
}));

vi.mock("src/view/browser/components/TabView", () => ({
  TabPanel: ({ tab }: { tab: Tab }) => <div data-testid="detached-tab-panel">{tab.id}</div>,
}));

// 窓のライフサイクルテストでは、共通Chromeの個別サービス初期化を対象にしない。
// それらは各コンポーネントのテストで検証し、ここではPortalの生成・再利用だけを確認する。
vi.mock("src/view/browser/components/AutoRefreshStatusItem", () => ({
  AutoRefreshStatusItem: () => null,
}));
vi.mock("src/view/browser/components/CommentOverlayStatusItem", () => ({
  CommentOverlayStatusItem: () => null,
}));
vi.mock("src/view/browser/components/IkioiStatusItem", () => ({ IkioiStatusItem: () => null }));
vi.mock("src/view/browser/components/NgStatusItem", () => ({ NgStatusItem: () => null }));
vi.mock("src/view/browser/components/PageCountStatusItem", () => ({
  PageCountStatusItem: () => null,
}));
vi.mock("src/view/browser/components/PopularFilterStatusItem", () => ({
  PopularFilterStatusItem: () => null,
}));
vi.mock("src/view/browser/components/TitleBar", () => ({ TitleBar: () => null }));

vi.mock("src/view/browser/hooks/use-ng-status", () => ({
  NgStatusProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("src/view/browser/hooks/use-write-session", () => ({
  useWriteSession: () => ({
    openWriteWindow: vi.fn(),
    selectThread: vi.fn(),
  }),
}));

function createThreadTab(id: string): Tab {
  return {
    id,
    history: [
      {
        type: "thread",
        title: "テストスレッド",
        threadUrl: "https://example.com/test/read.cgi/board/1/",
      },
    ],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  };
}

const Probe: React.FC = () => {
  const { isDetachedTab, detachTab, reattachTab } = useDetachedTabController();
  return (
    <>
      <output data-testid="detached-state">{String(isDetachedTab("tab-1"))}</output>
      <button type="button" onClick={() => detachTab("tab-1")}>
        開く
      </button>
      <button type="button" onClick={() => reattachTab("tab-1")}>
        切り替え
      </button>
    </>
  );
};

describe("TabWindowHost", () => {
  beforeEach(() => {
    const tab = createThreadTab("tab-1");
    mocks.panes = [{ id: "pane-1", tabs: [tab, createThreadTab("tab-2")], activeTabId: tab.id }];
    mocks.root = document.createElement("div");
    document.body.appendChild(mocks.root);
    mocks.fakeWindow = {
      closed: false,
      document,
      focus: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    mocks.openAuxiliaryWindow.mockReset();
    mocks.tabDispatch.mockReset();
    mocks.openAuxiliaryWindow.mockReturnValue({ window: mocks.fakeWindow, root: mocks.root });
  });

  afterEach(() => {
    cleanup();
    mocks.root?.remove();
    mocks.root = null;
    mocks.fakeWindow = null;
  });

  it("同じタブを二度開いても窓を増やさず再利用する", () => {
    render(
      <TabWindowHost>
        <Probe />
      </TabWindowHost>,
    );

    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    fireEvent.click(screen.getByRole("button", { name: "開く" }));

    expect(mocks.openAuxiliaryWindow).toHaveBeenCalledTimes(1);
    expect(mocks.fakeWindow?.focus).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("detached-state")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "切り替え" }));
    expect(screen.getByTestId("detached-state")).toHaveTextContent("false");
    expect(mocks.fakeWindow?.close).toHaveBeenCalledTimes(1);
    expect(mocks.tabDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "CLOSE_TAB", tabId: "tab-1" }),
    );
  });

  it("別窓の再読み込みではタブを終了しない", () => {
    render(
      <TabWindowHost>
        <Probe />
      </TabWindowHost>,
    );

    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    if (!mocks.fakeWindow) {
      throw new Error("テスト用の別窓が作成されていません");
    }
    const beforeUnload = (mocks.fakeWindow.addEventListener as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as (() => void) | undefined;
    act(() => beforeUnload?.());

    expect(screen.getByTestId("detached-state")).toHaveTextContent("true");
    expect(mocks.tabDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "CLOSE_TAB", tabId: "tab-1" }),
    );
  });

  it("別窓がOS側で閉じられたらタブを終了する", () => {
    render(
      <TabWindowHost>
        <Probe />
      </TabWindowHost>,
    );

    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    if (!mocks.fakeWindow) {
      throw new Error("テスト用の別窓が作成されていません");
    }
    Object.defineProperty(mocks.fakeWindow, "closed", { configurable: true, value: true });
    const beforeUnload = (mocks.fakeWindow.addEventListener as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as (() => void) | undefined;
    act(() => beforeUnload?.());

    expect(screen.getByTestId("detached-state")).toHaveTextContent("false");
    expect(mocks.tabDispatch).toHaveBeenCalledWith({
      type: "CLOSE_TAB",
      paneId: "pane-1",
      tabId: "tab-1",
      preserveActivePane: true,
      replaceLastTab: true,
    });
  });

  it("最後の表示タブを切り離した時は本窓用の代替タブを作る", () => {
    const tab = createThreadTab("tab-1");
    mocks.panes = [{ id: "pane-1", tabs: [tab], activeTabId: tab.id }];

    render(
      <TabWindowHost>
        <Probe />
      </TabWindowHost>,
    );

    fireEvent.click(screen.getByRole("button", { name: "開く" }));

    expect(mocks.tabDispatch).toHaveBeenCalledWith({
      type: "ADD_TAB",
      paneId: "pane-1",
      preserveActivePane: true,
    });
  });

  it("窓を開けない場合は別窓状態にせず元画面を残す", () => {
    mocks.openAuxiliaryWindow.mockReturnValue(null);
    render(
      <TabWindowHost>
        <Probe />
      </TabWindowHost>,
    );

    fireEvent.click(screen.getByRole("button", { name: "開く" }));

    expect(screen.getByTestId("detached-state")).toHaveTextContent("false");
    expect(mocks.fakeWindow?.close).not.toHaveBeenCalled();
  });
});
