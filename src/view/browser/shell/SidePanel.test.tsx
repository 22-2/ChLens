import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SidePanel } from "src/view/browser/shell/SidePanel";
import { DEFAULT_SIDE_PANEL } from "src/view/browser/state/tabs/side-panel-state";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({ viewTab: { id: "tab" } }),
  useSidePanelState: () => ({
    state: { ...DEFAULT_SIDE_PANEL, isOpen: true },
    dispatch: mocks.dispatch,
  }),
}));
// 書き込み欄は書き込み機能のテストで確かめ、枠の検証では投稿処理の依存を読み込まない。
vi.mock("src/view/browser/shell/SidePanelWrite", () => ({ SidePanelWrite: () => null }));
// 画像一覧が読み込む画像取得の事前確認は拡張機能 API を必要とするため、枠の検証では差し替える。
vi.mock("src/features/media/browser/image-download-preflight", () => ({
  allowImageWithinCurrentLimit: vi.fn(),
  requestMediaImageDownload: vi.fn(() => Promise.resolve()),
}));

describe("サイドパネル", () => {
  afterEach(() => {
    cleanup();
    mocks.dispatch.mockClear();
  });
  it("ビューを選択して状態を更新する", () => {
    render(<SidePanel />);
    fireEvent.click(screen.getByRole("tab", { name: "画像一覧" }));
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ sidePanel: expect.objectContaining({ activeView: "images" }) }),
    );
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

vi.mock("src/view/browser/shell/SidePanelBoards", () => ({
  SidePanelBoards: () => <div>板一覧</div>,
}));

vi.mock("src/view/browser/shell/SidePanelFavorites", () => ({
  SidePanelFavorites: () => <div>お気に入り</div>,
}));
