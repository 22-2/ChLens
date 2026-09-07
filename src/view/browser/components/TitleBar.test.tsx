import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TitleBar } from "src/view/browser/components/TitleBar";
import type { Page } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { dispatchMock, mocks } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  mocks: {
    currentPage: {
      type: "thread" as const,
      title: "Current Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/1/",
    } as Page,
    activeTab: {
      id: "tab-1",
      history: [
        {
          type: "thread",
          title: "Current Thread",
          threadUrl: "https://egg.5ch.net/test/read.cgi/software/1/",
        },
      ],
      currentIndex: 0,
      pinned: false,
      reloadKey: 0,
      autoRefreshEnabled: false,
      autoRefreshPageKey: null,
    },
  },
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    activeTab: mocks.activeTab,
    currentPage: mocks.currentPage,
    dispatch: dispatchMock,
    paneId: "pane-1",
  }),
  useTabPanes: () => ({ panes: [{ id: "pane-1" }], activePaneId: "pane-1" }),
}));

vi.mock("src/view/browser/components/TabContextMenu", () => ({
  TabContextMenu: ({
    tab,
    position,
  }: {
    tab: { id: string };
    position: { x: number; y: number };
  }) => (
    <div
      data-testid="title-bar-tab-menu"
      data-tab-id={tab.id}
      data-x={position.x}
      data-y={position.y}
    />
  ),
}));

const { orientationHolder } = vi.hoisted(() => ({
  orientationHolder: { value: "horizontal" },
}));

vi.mock("src/view/browser/hooks/use-tab-bar-orientation", () => ({
  // 変更理由: タイトルバー左端の更新ボタンは垂直モードだけで出すため、方向指定で切り替える。
  useTabBarOrientation: () => orientationHolder.value,
}));

describe("TitleBar", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.currentPage = {
      type: "thread",
      title: "Current Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/1/",
    };
    orientationHolder.value = "horizontal";
    dispatchMock.mockReset();
  });

  it("アクティブページのタイトルを中央表示する", () => {
    render(<TitleBar />);

    const titleBar = screen.getByTestId("title-bar");
    expect(titleBar).toBeInTheDocument();
    expect(screen.getByTestId("title-bar-title")).toHaveTextContent("Current Thread");
    expect(screen.getByRole("toolbar", { name: "レイアウト操作" })).toHaveClass(
      "action-toolbar-container",
    );
  });

  it("ペイン分割ボタンは表示せずコマンド操作に任せる", () => {
    render(<TitleBar />);

    expect(screen.queryByRole("button", { name: "2ペインで表示" })).toBeNull();
    expect(screen.queryByRole("button", { name: "2ペイン表示を解除" })).toBeNull();
  });

  it("ナビゲーション受け口が自ペインのIDを持つ", () => {
    render(<TitleBar />);

    expect(screen.getByTestId("title-bar-nav-slot")).toHaveAttribute("data-pane-id", "pane-1");
  });

  it("垂直モードでは左端に更新ボタンを出す", () => {
    orientationHolder.value = "vertical";
    render(<TitleBar />);

    const refreshButton = screen.getByRole("button", { name: "更新" });
    expect(screen.getByTestId("title-bar-leading")).toContainElement(refreshButton);

    fireEvent.click(refreshButton);

    expect(dispatchMock).toHaveBeenCalledWith({ type: "RELOAD" });
  });

  it("水平モードでは左端を空のままにする", () => {
    render(<TitleBar />);

    expect(screen.getByTestId("title-bar-leading")).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: "更新" })).toBeNull();
  });

  it("長いタイトルは省略可能なタイトル属性を持つ", () => {
    mocks.currentPage = {
      type: "thread",
      title: "長いスレッドタイトル".repeat(20),
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/1/",
    };

    render(<TitleBar />);

    const title = screen.getByTestId("title-bar-title");
    expect(title).toHaveAttribute("title", mocks.currentPage.title);
    expect(title).toHaveClass("title-bar__title");
  });

  it("タイトルを右クリックするとタブと同じメニューを表示する", () => {
    render(<TitleBar />);

    const title = screen.getByTestId("title-bar-title");
    fireEvent.contextMenu(title, { clientX: 120, clientY: 10 });

    const menu = screen.getByTestId("title-bar-tab-menu");
    expect(menu).toHaveAttribute("data-tab-id", "tab-1");
    expect(menu).toHaveAttribute("data-x", "120");
    expect(menu).toHaveAttribute("data-y", "10");
  });
});
