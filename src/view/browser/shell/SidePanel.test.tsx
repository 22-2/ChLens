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
  hiddenViews: [] as string[],
  page: { type: "home", title: "ホーム" },
}));
vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({ viewTab: { id: "tab" }, viewPage: mocks.page }),
  useSidePanelState: () => ({
    state: {
      ...DEFAULT_SIDE_PANEL,
      isOpen: true,
      activeView: mocks.activeView,
      hiddenViews: mocks.hiddenViews,
    },
    dispatch: mocks.dispatch,
  }),
}));
// 書き込み欄は書き込み機能のテストで確かめ、枠の検証では投稿処理の依存を読み込まない。
vi.mock("src/features/write/ui/SidePanelWrite", () => ({ SidePanelWrite: () => null }));
// 画像コピーの実装は拡張APIを読み込むため、この画面のテストでは差し替える。
vi.mock("src/features/media/browser/media-viewer-copy", () => ({
  copyMediaImageWithNotice: vi.fn(),
}));

describe("サイドパネル", () => {
  afterEach(() => {
    cleanup();
    mocks.dispatch.mockClear();
    mocks.activeView = "boards";
    mocks.hiddenViews = [];
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
  it("タブとタブバーの右クリックから表示を切り替える", () => {
    const { rerender } = render(<SidePanel />);
    fireEvent.contextMenu(screen.getByRole("tab", { name: "板一覧" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "板一覧" }));
    expect(mocks.dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sidePanel: expect.objectContaining({ hiddenViews: ["boards"], activeView: "favorites" }),
      }),
    );
    mocks.hiddenViews = ["boards", "favorites", "images", "extract", "properties", "write"];
    rerender(<SidePanel />);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    fireEvent.contextMenu(screen.getByRole("tablist", { name: "サイドパネルのビュー" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "板一覧" }));
    expect(mocks.dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sidePanel: expect.objectContaining({
          hiddenViews: ["favorites", "images", "extract", "properties", "write"],
          activeView: "boards",
        }),
      }),
    );
  });
});

vi.mock("src/app/platform/index", () => ({ platform: {} }));
vi.mock("src/view/browser/hooks/use-url-handlers", () => ({
  useUrlHandlers: () => ({
    handleUrlClick: () => false,
    handleUrlContextMenu: () => false,
    openPopupUrlContextMenu: () => () => undefined,
  }),
}));

vi.mock("src/features/board/ui/SidePanelBoards", () => ({
  SidePanelBoards: () => <div>板一覧</div>,
}));

vi.mock("src/features/bookmark/ui/SidePanelFavorites", () => ({
  SidePanelFavorites: () => <div>お気に入り</div>,
}));

vi.mock("src/view/browser/ui/ContextMenu", () => ({
  ContextMenu: ({
    items,
    onClose,
  }: {
    items: { id: string; label: string; checked: boolean; onSelect: () => void }[];
    onClose: () => void;
  }) => (
    <div role="menu">
      {items.map((item) => (
        <button
          key={item.id}
          role="menuitemcheckbox"
          aria-checked={item.checked}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  ),
}));
