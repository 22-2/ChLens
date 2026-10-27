import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useBoardListDisplay } from "src/view/browser/pages/board-list/use-board-list-display";
import { useBoardListLogic } from "src/view/browser/pages/board-list/use-board-list-logic";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { config, setConfig, updateViewState, warn, persistedViewState } = vi.hoisted(() => ({
  config: new Map<string, string>(),
  setConfig: vi.fn(),
  updateViewState: vi.fn(),
  warn: vi.fn(),
  persistedViewState: { searchQuery: "", boardListOpenStates: undefined as unknown },
}));
vi.mock("src/app/logger", () => ({ createLogger: () => ({ warn, error: vi.fn() }) }));
vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabViewState: () => ({ state: persistedViewState, update: updateViewState }),
}));
vi.mock("src/service-container/index", () => ({
  container: {
    config: { get: (key: string) => config.get(key) ?? null, set: setConfig },
    message: { on: vi.fn(), off: vi.fn() },
    bbsMenu: {
      get: vi.fn(async () => ({
        status: "success",
        menu: [
          {
            name: "メニュー",
            categories: [
              {
                name: "カテゴリ",
                boards: [{ name: "サンプル板", url: "https://example.com/sample/" }],
              },
            ],
          },
        ],
      })),
    },
  },
}));

describe("板一覧の保存設定とフィルタの復元", () => {
  beforeEach(() => {
    config.clear();
    persistedViewState.searchQuery = "";
    persistedViewState.boardListOpenStates = undefined;
    updateViewState
      .mockReset()
      .mockImplementation((patch: object) => Object.assign(persistedViewState, patch));
    warn.mockClear();
    setConfig.mockReset().mockImplementation((key: string, value: string) => {
      config.set(key, value);
    });
  });
  afterEach(cleanup);

  function useBoardList() {
    const logic = useBoardListLogic();
    const display = useBoardListDisplay({ ...logic, tabId: "tab-1" });
    return { ...logic, ...display };
  }

  it.each([null, [], true, "破損"])("不正な保存値でも空の開閉状態で表示する", async (saved) => {
    persistedViewState.boardListOpenStates = saved;
    const { result } = renderHook(useBoardList);
    await waitFor(() => expect(result.current.displayMenus).toHaveLength(1));
    expect(result.current.openStates).toEqual({});
  });

  it("開閉状態をタブの表示状態に保存し、再表示で復元する", async () => {
    const first = renderHook(useBoardList);
    await waitFor(() => expect(first.result.current.displayMenus).toHaveLength(1));
    act(() => first.result.current.updateOpenStates(() => ({ メニュー: true })));
    expect(persistedViewState.boardListOpenStates).toEqual({ メニュー: true });
    expect(config.has("board_list_open_states")).toBe(false);
    first.unmount();
    const restarted = renderHook(useBoardList);
    await waitFor(() => expect(restarted.result.current.openedMenuValues).toEqual(["メニュー"]));
  });

  it("検索を解除すると元の開閉状態に戻す", async () => {
    persistedViewState.boardListOpenStates = { メニュー: true, "メニュー:カテゴリ": false };
    const { result } = renderHook(useBoardList);
    await waitFor(() => expect(result.current.displayMenus).toHaveLength(1));
    act(() => result.current.setSearchQuery("サンプル"));
    act(() => result.current.setSearchQuery(""));
    await waitFor(() =>
      expect(result.current.openStates).toEqual({ メニュー: true, "メニュー:カテゴリ": false }),
    );
  });
});
