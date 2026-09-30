import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { historyRecords, favoriteBoards } = vi.hoisted(() => ({
  historyRecords: [
    {
      url: "https://example.com/test/read.cgi/sample/1/",
      boardTitle: "サンプル板",
      date: 1,
    },
  ],
  favoriteBoards: [{ url: "https://example.com/sample/", title: "サンプル板" }],
}));

vi.mock("src/core/History", () => ({ getAll: vi.fn(async () => historyRecords) }));
vi.mock("src/view/browser/utils/legacy-app", () => ({
  getLegacyBookmarkService: () => ({ getAllBoards: () => favoriteBoards }),
  waitForLegacyBookmarkReady: vi.fn(async () => undefined),
}));
vi.mock("src/service-container/index", () => ({
  container: { message: { on: vi.fn(), off: vi.fn() } },
}));
vi.mock("src/app/platform", () => ({
  platform: { window: { setTitle: vi.fn(async () => undefined) } },
}));
vi.mock("webextension-polyfill", () => ({
  default: { runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() } } },
}));

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("ホームの板項目のミドルクリック", () => {
  beforeEach(() => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    historyRecords.splice(0, historyRecords.length, {
      url: "https://example.com/test/read.cgi/sample/1/",
      boardTitle: "サンプル板",
      date: 1,
    });
    favoriteBoards.splice(0, favoriteBoards.length, {
      url: "https://example.com/sample/",
      title: "サンプル板",
    });
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  async function renderPage(kind: "常設ホーム" | "お気に入り板") {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/hooks/use-tab-store");
    const { HomeTabPage } = await import("src/view/browser/pages/HomeTabPage");
    const { BoardTreePage } = await import("src/view/browser/pages/BoardTreePage");
    function State() {
      const { state, viewPage } = useTabStore();
      return (
        <>
          <output data-testid="tab-count">{state.tabs.length}</output>
          <output data-testid="active-page-type">{viewPage.type}</output>
        </>
      );
    }
    render(
      <TabProvider>
        <State />
        {kind === "常設ホーム" ? <HomeTabPage /> : <BoardTreePage />}
      </TabProvider>,
    );
  }

  it.each(["常設ホーム", "お気に入り板"] as const)(
    "%s でmousedownの既定動作を止め、背景タブだけを追加する",
    async (kind) => {
      await renderPage(kind);
      const board = await screen.findByRole("button", { name: /サンプル板/ });
      const initialTabCount = Number(screen.getByTestId("tab-count").textContent);

      // 実ブラウザーは中ボタンのmousedownからオートスクロールを始めるため、
      // イベント順を再現して、その既定動作がキャンセルされることを確認する。
      expect(fireEvent.mouseDown(board, { button: 1 })).toBe(false);
      fireEvent(board, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));

      await waitFor(() =>
        expect(Number(screen.getByTestId("tab-count").textContent)).toBe(initialTabCount + 1),
      );
      expect(screen.getByTestId("active-page-type")).toHaveTextContent("boardTree");
    },
  );
});
