import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { historyRecords, favoriteBoards, removeBookmarkMock, copyTextMock, toastErrorMock } =
  vi.hoisted(() => ({
    removeBookmarkMock: vi.fn(async (_url: string) => true),
    copyTextMock: vi.fn(async (_text: string) => undefined),
    toastErrorMock: vi.fn(),
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
  container: {
    message: { on: vi.fn(), off: vi.fn() },
    bookmark: { remove: removeBookmarkMock },
    toast: { notify: vi.fn(), info: vi.fn(), success: vi.fn(), error: toastErrorMock },
  },
}));
vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/view/browser/utils/clipboard")>()),
  copyText: copyTextMock,
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
    removeBookmarkMock.mockReset().mockResolvedValue(true);
    copyTextMock.mockReset().mockResolvedValue(undefined);
    toastErrorMock.mockReset();
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
    vi.restoreAllMocks();
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
          <button
            onClick={() =>
              dispatch({ type: "SELECT_TAB", tabId: state.tabs.find((tab) => !tab.locked)!.id })
            }
          >
            板一覧を選ぶ
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

  async function openFavoriteMenu() {
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(2),
    );
    const favorite = screen.getAllByRole("button", { name: /サンプル板/ })[0];
    expect(fireEvent.contextMenu(favorite, { clientX: 40, clientY: 80 })).toBe(false);
    return favorite;
  }

  it("常設ホームの右クリックは遷移せず、メニューから新規タブだけを開く", async () => {
    await renderPage();
    const initialCount = Number(screen.getByTestId("tab-count").textContent);
    await openFavoriteMenu();
    expect(screen.queryByRole("button", { name: "現在のタブで開く" })).not.toBeInTheDocument();
    expect(Number(screen.getByTestId("tab-count").textContent)).toBe(initialCount);
    fireEvent.click(screen.getByRole("button", { name: "新しいタブで開く" }));
    expect(Number(screen.getByTestId("tab-count").textContent)).toBe(initialCount + 1);
    expect(screen.getByTestId("home-history")).toHaveTextContent(/^home$/);
    expect(screen.getByTestId("new-tab-history")).toHaveTextContent(/^boardList\|threadList$/);
  });

  it.each([
    ["タイトルをコピー", "サンプル板"],
    ["URLをコピー", "https://example.com/sample/"],
    ["タイトル&URLをコピー", "サンプル板\nhttps://example.com/sample/"],
    ["タイトル&URLをMarkdownでコピー", "[サンプル板](https://example.com/sample/)"],
  ])("ホームの%sで対象板をコピーする", async (label, expected) => {
    await renderPage();
    await openFavoriteMenu();
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() =>
      expect(copyTextMock).toHaveBeenCalledWith(
        expected,
        expect.objectContaining({ window, document }),
      ),
    );
    expect(screen.getByTestId("home-history")).toHaveTextContent(/^home$/);
  });

  it("ホームからお気に入りを削除しても最近開いた板は残す", async () => {
    await renderPage();
    await openFavoriteMenu();
    fireEvent.click(screen.getByRole("button", { name: "ブックマークを削除" }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(1),
    );
    expect(removeBookmarkMock).toHaveBeenCalledWith("https://example.com/sample/");
    expect(screen.getByTestId("home-history")).toHaveTextContent(/^home$/);
  });

  it("削除の例外を通知し、お気に入り板を画面に残す", async () => {
    removeBookmarkMock.mockRejectedValueOnce(new Error("保存失敗"));
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await renderPage();
    await openFavoriteMenu();
    fireEvent.click(screen.getByRole("button", { name: "ブックマークを削除" }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(logger).toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(2);
  });

  it("タブを切り替えたらメニューを閉じ、ホームへ戻っても再表示しない", async () => {
    await renderPage();
    await openFavoriteMenu();
    fireEvent.click(screen.getByRole("button", { name: "板一覧を選ぶ" }));
    expect(screen.queryByRole("button", { name: "ブックマークを削除" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ホームを選ぶ" }));
    expect(screen.queryByRole("button", { name: "ブックマークを削除" })).not.toBeInTheDocument();
  });

  it("メニュー項目の中クリックでもホームを保ち、背景タブで板を開く", async () => {
    await renderPage();
    await openFavoriteMenu();
    fireEvent(
      screen.getByRole("button", { name: "新しいタブで開く" }),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );
    expect(screen.getByTestId("active-page-type")).toHaveTextContent(/^home$/);
    expect(screen.getByTestId("new-tab-history")).toHaveTextContent(/^boardList\|threadList$/);
  });

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
