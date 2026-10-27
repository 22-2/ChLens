import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SidePanel } from "src/view/browser/shell/SidePanel";
import { DEFAULT_SIDE_PANEL } from "src/view/browser/state/tabs/side-panel-state";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

// dnd-kit は読み込み時に ResizeObserver を参照するため、import より前に差し替える。
vi.hoisted(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  activeView: "boards",
  page: { type: "home", title: "ホーム" },
}));
vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({ viewTab: { id: "tab" }, viewPage: mocks.page }),
  useSidePanelState: () => ({
    state: { ...DEFAULT_SIDE_PANEL, isOpen: true, activeView: mocks.activeView },
    dispatch: mocks.dispatch,
  }),
}));
// 書き込み欄は書き込み機能のテストで確かめ、枠の検証では投稿処理の依存を読み込まない。
vi.mock("src/features/write/ui/SidePanelWrite", () => ({ SidePanelWrite: () => null }));

describe("サイドパネル", () => {
  afterEach(() => {
    cleanup();
    mocks.dispatch.mockClear();
    mocks.activeView = "boards";
  });
  it("ビューを選択して状態を更新する", () => {
    render(<SidePanel />);
    fireEvent.click(screen.getByRole("tab", { name: "画像一覧" }));
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ sidePanel: expect.objectContaining({ activeView: "images" }) }),
    );
  });
  it("スレ以外では、スレを使うビューの代わりに案内を出す", () => {
    mocks.activeView = "properties";
    render(<SidePanel />);
    expect(screen.getByText("スレプロパティ")).toBeInTheDocument();
    expect(screen.getByText("スレッドを開くと表示されます。")).toBeInTheDocument();
  });
  it("スレに依存しないビューはスレ以外でも表示する", () => {
    render(<SidePanel />);
    expect(screen.getAllByText("板一覧").length).toBeGreaterThan(0);
    expect(screen.queryByText("スレッドを開くと表示されます。")).not.toBeInTheDocument();
  });
  it("キーボードでビューを並べ替える", () => {
    render(<SidePanel />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "画像一覧" }), {
      key: "ArrowLeft",
      altKey: true,
    });
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        sidePanel: expect.objectContaining({
          views: ["boards", "images", "favorites", "extract", "properties", "write"],
        }),
      }),
    );
  });
});

vi.mock("src/features/board/ui/SidePanelBoards", () => ({
  SidePanelBoards: () => <div>板一覧</div>,
}));

vi.mock("src/features/bookmark/ui/SidePanelFavorites", () => ({
  SidePanelFavorites: () => <div>お気に入り</div>,
}));
