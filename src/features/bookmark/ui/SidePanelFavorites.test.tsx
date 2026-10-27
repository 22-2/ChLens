import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SidePanelFavorites } from "src/features/bookmark/ui/SidePanelFavorites";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  read: vi.fn(async () => [
    {
      url: "https://example.com/sample/",
      title: "サンプル板",
      boardTitle: "サンプル板",
      pageType: "threadList",
      unreadCount: 0,
    },
  ]),
}));
// 開くページの組み立ては本物を使い、保存済みのお気に入りの読み込みだけを差し替える。
vi.mock("src/features/bookmark/browser/read-bookmarks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/features/bookmark/browser/read-bookmarks")>()),
  readBookmarks: mocks.read,
}));
vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({ dispatch: mocks.dispatch }),
}));
vi.mock("src/service-container/index", () => ({
  container: { message: { on: mocks.on, off: mocks.off } },
}));
vi.mock("src/features/bookmark/ui/BookmarkContextMenu", () => ({
  BookmarkContextMenu: () => null,
}));

describe("サイドパネルのお気に入り", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  it("既存のお気に入りを読み、選択した板を開く", async () => {
    render(<SidePanelFavorites />);
    fireEvent.click(await screen.findByRole("button", { name: "サンプル板" }));
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "NAVIGATE",
        page: expect.objectContaining({ title: "サンプル板" }),
      }),
    );
    expect(mocks.on).toHaveBeenCalledWith("bookmark_updated", expect.any(Function));
  });
});
