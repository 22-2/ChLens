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

  async function renderPage() {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/hooks/use-tab-store");
    const { HomeTabPage } = await import("src/view/browser/pages/HomeTabPage");
    function State() {
      const { state, viewPage, dispatch } = useTabStore();
      return (
        <>
          <button
            onClick={() =>
              dispatch({ type: "SELECT_TAB", tabId: state.tabs.find((tab) => tab.locked)!.id })
            }
          >
            ホームを選ぶ
          </button>
          <output data-testid="tab-count">{state.tabs.length}</output>
          <output data-testid="active-page-type">{viewPage.type}</output>
          <output data-testid="home-history">
            {state.tabs
              .find((tab) => tab.locked)
              ?.history.map((page) => page.type)
              .join("|")}
          </output>
          <output data-testid="new-tab-history">
            {state.tabs
              .at(-1)
              ?.history.map((page) => page.type)
              .join("|")}
          </output>
        </>
      );
    }
    render(
      <TabProvider>
        <State />
        <HomeTabPage />
      </TabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "ホームを選ぶ" }));
  }

  it.each(["最近開いた板", "お気に入り板"] as const)(
    "%s でmousedownの既定動作を止め、背景タブだけを追加する",
    async (kind) => {
      await renderPage();
      await screen.findAllByRole("button", { name: /サンプル板/ });
      await waitFor(() =>
        expect(screen.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(2),
      );
      const board = screen.getAllByRole("button", { name: /サンプル板/ })[
        kind === "お気に入り板" ? 0 : 1
      ];
      const initialTabCount = Number(screen.getByTestId("tab-count").textContent);

      // 実ブラウザーは中ボタンのmousedownからオートスクロールを始めるため、
      // イベント順を再現して、その既定動作がキャンセルされることを確認する。
      expect(fireEvent.mouseDown(board, { button: 1 })).toBe(false);
      fireEvent(board, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));

      await waitFor(() =>
        expect(Number(screen.getByTestId("tab-count").textContent)).toBe(initialTabCount + 1),
      );
      expect(screen.getByTestId("active-page-type")).toHaveTextContent("home");
      expect(screen.getByTestId("new-tab-history")).toHaveTextContent("boardList|threadList");
    },
  );

  it.each(["最近開いた板", "お気に入り板"] as const)(
    "%sの通常クリックでも常設ホームを上書きせず、板一覧を戻る先にする",
    async (kind) => {
      await renderPage();
      await waitFor(() =>
        expect(screen.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(2),
      );
      const board = screen.getAllByRole("button", { name: /サンプル板/ })[
        kind === "お気に入り板" ? 0 : 1
      ];
      const initialTabCount = Number(screen.getByTestId("tab-count").textContent);
      fireEvent.click(board);
      expect(Number(screen.getByTestId("tab-count").textContent)).toBe(initialTabCount + 1);
      expect(screen.getByTestId("home-history")).toHaveTextContent(/^home$/);
      expect(screen.getByTestId("new-tab-history")).toHaveTextContent(/^boardList\|threadList$/);
    },
  );

  it("ホームから板一覧を中クリックで開いてもホームを保ち、戻る先を重複させない", async () => {
    await renderPage();
    const boardList = screen.getByRole("button", { name: "板一覧を開く" });
    expect(fireEvent.mouseDown(boardList, { button: 1 })).toBe(false);
    fireEvent(
      boardList,
      new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }),
    );
    expect(screen.getByTestId("active-page-type")).toHaveTextContent("home");
    expect(screen.getByTestId("new-tab-history")).toHaveTextContent(/^boardList$/);
  });
});
