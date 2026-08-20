import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  commandPalette,
  commandPaletteStore,
} from "src/view/browser/commands/command-palette-store";
import { CommandPalette } from "src/view/browser/components/CommandPalette";
import type { Page } from "src/view/browser/types";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const {
  dispatchMock,
  loadRecentCommandIdsMock,
  requestThreadResJumpMock,
  saveRecentCommandIdsMock,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  loadRecentCommandIdsMock: vi.fn(async () => [] as string[]),
  requestThreadResJumpMock: vi.fn(),
  saveRecentCommandIdsMock: vi.fn(async () => undefined),
}));

let currentPage: Page = {
  type: "thread",
  title: "Current Thread",
  threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
};
let paneCount = 1;

vi.mock("src/view/browser/commands/command-palette-history", () => ({
  loadRecentCommandIds: loadRecentCommandIdsMock,
  saveRecentCommandIds: saveRecentCommandIdsMock,
}));

vi.mock("src/view/browser/utils/thread-read-state", () => ({
  requestThreadResJump: requestThreadResJumpMock,
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => {
    const activeTab = {
      id: "tab-1",
      history: [currentPage],
      currentIndex: 0,
      pinned: false,
      reloadKey: 0,
      autoRefreshEnabled: false,
      autoRefreshPageKey: null,
    };
    return {
      state: { tabs: [activeTab] },
      activeTab,
      currentPage,
      dispatch: dispatchMock,
    };
  },
  useTabPanes: () => ({
    panes: Array.from({ length: paneCount }, (_, index) => ({
      id: `pane-${index + 1}`,
    })),
    activePaneId: "pane-1",
  }),
}));

vi.mock("src/view/browser/hooks/use-bottom-panel", () => ({
  useBottomPanel: () => ({
    isOpen: false,
    togglePanel: vi.fn(),
  }),
}));

function renderPalette() {
  commandPalette.open();
  return render(<CommandPalette />);
}

describe("CommandPalette", () => {
  afterEach(() => {
    cleanup();
    commandPalette.close();
    commandPaletteStore.updateState((current) => ({ ...current, selected: -1 }));
    dispatchMock.mockReset();
    requestThreadResJumpMock.mockReset();
    loadRecentCommandIdsMock.mockClear();
    saveRecentCommandIdsMock.mockReset();
    vi.unstubAllGlobals();
    paneCount = 1;
    currentPage = {
      type: "thread",
      title: "Current Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    };
  });

  it("コマンドをRadix Dialog内へ表示する", () => {
    renderPalette();

    expect(screen.getByRole("dialog")).toHaveClass("command-palette__content");
    expect(screen.getByRole("button", { name: /subject\.txtのURLをコピー/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /datのURLをコピー/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /スレ全体をTOON形式でコピー/ })).toBeInTheDocument();
  });

  it("ホームではページ依存コマンドを表示しない", () => {
    currentPage = { type: "home", title: "ホーム" };
    renderPalette();

    expect(screen.queryByRole("button", { name: "datのURLをコピー" })).toBeNull();
    expect(screen.queryByRole("button", { name: "スレ全体をTOON形式でコピー" })).toBeNull();
    expect(screen.queryByRole("button", { name: "現在のページURLをコピー" })).toBeNull();
    expect(screen.getByRole("button", { name: /設定を開く/ })).toBeInTheDocument();
  });

  it("レス番号ジャンプはパレットを閉じて入力ダイアログを開く", () => {
    renderPalette();

    fireEvent.click(screen.getByRole("button", { name: /レス番号を指定してジャンプ/ }));

    expect(screen.getByRole("dialog")).toHaveClass("command-palette__dialog-content");
    fireEvent.change(screen.getByLabelText("レス番号"), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ジャンプ" }));

    expect(requestThreadResJumpMock).toHaveBeenCalledWith(
      "https://egg.5ch.net/test/read.cgi/software/123/",
      42,
    );
    expect(screen.queryByRole("button", { name: "ジャンプ" })).toBeNull();
  });

  it("2ペイン時は解除コマンドを表示して現在ペインを閉じる", () => {
    paneCount = 2;
    renderPalette();

    fireEvent.click(screen.getByRole("button", { name: /2ペイン表示を解除/ }));
    expect(dispatchMock).toHaveBeenCalledWith({ type: "CLOSE_PANE" });
  });

  it("ダイアログの検索欄をキーボードで操作できる", () => {
    renderPalette();
    const search = screen.getByLabelText("コマンドを検索");

    fireEvent.change(search, { target: { value: "Open Settings" } });

    expect(screen.getByRole("button", { name: /設定を開く/ })).toHaveTextContent("Open Settings");
    expect(screen.queryByText("アプリの設定画面を開きます")).toBeNull();
    expect(screen.queryByRole("button", { name: /現在のページを更新/ })).toBeNull();
  });

  it("開いた直後に先頭のコマンドを選択する", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    renderPalette();

    expect(screen.getByRole("button", { name: /設定を開く/ })).toHaveAttribute(
      "data-selected",
      "true",
    );
  });
});
