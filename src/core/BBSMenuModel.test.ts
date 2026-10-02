import { getStore2String, setStore2String } from "src/app/Store2Storage";
import { BBSMenuModel } from "src/core/BBSMenuModel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { configSet } = vi.hoisted(() => ({ configSet: vi.fn() }));
vi.mock("src/service-container/index", () => ({
  container: {
    config: { get: (key: string) => getStore2String(`config_${key}`), set: configSet },
  },
}));
vi.mock("src/core/BoardTitleSolver.js", () => ({ ask: vi.fn() }));
vi.mock("src/core/History", () => ({ getUnique: vi.fn() }));
vi.mock("src/core/ReadState.js", () => ({ getAll: vi.fn() }));
vi.mock("src/core/URL", () => ({ URL: class {} }));
vi.mock("src/core/BBSMenuFetcher", () => ({ BBSMenuFetcher: class {} }));
vi.mock("src/core/BoardUrlNormalizer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/core/BoardUrlNormalizer")>();
  // 架空の掲示板ホストを使い、再起動時のデータ読み取りを実在の板へ依存させない。
  return {
    ...actual,
    normalizeBoardUrl: (url: string) => actual.normalizeBoardUrl(url),
    getBoardUrlKey: (url: string) => actual.getBoardUrlKey(url),
    normalizeBBSMenus: <T>(menus: T[]) => menus,
  };
});

describe("板一覧の読み取りと開いた板の永続データ", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      key: (index) => [...values.keys()][index] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    configSet
      .mockReset()
      .mockImplementation((key: string, value: string) => setStore2String(`config_${key}`, value));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("保存後に板一覧を再構築しても閲覧日時を削らず、次の起動でも保持する", async () => {
    const raw = JSON.stringify([
      { url: "https://example.com/sample/", title: "サンプル板", lastVisited: 123 },
    ]);
    await setStore2String("config_opened_board_entries", raw);
    for (let restart = 0; restart < 2; restart += 1) {
      const menus = await new BBSMenuModel().fetchAll();
      expect(menus[0].categories[0].boards).toEqual([
        { url: "https://example.com/sample/", name: "サンプル板" },
      ]);
      expect(getStore2String("config_opened_board_entries")).toBe(raw);
    }
    expect(configSet).not.toHaveBeenCalled();
  });
});
