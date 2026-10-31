import "fake-indexeddb/auto";

import { TauriStorageManager } from "src/app/platform/tauri/StorageManager";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/app/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }),
}));

/** 保存先のデータベースはスキーマ作成と接続キャッシュを持つため、テストごとに名前を分けて干渉させない。 */
let dbSeq = 0;
function createStore() {
  dbSeq += 1;
  return TauriStorageManager.getStore(`tauri-storage-test-${dbSeq}`);
}

function dispatchStorageEvent(
  key: string | null,
  oldValue: string | null,
  newValue: string | null,
) {
  window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue }));
}

describe("Tauri の設定の保存（kv）", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("保存した値を、そのままの文字列で取得できる", async () => {
    await TauriStorageManager.kv.set("theme", "dark");

    expect(await TauriStorageManager.kv.get("theme")).toBe("dark");
  });

  it("保存されていないキーは null を返す", async () => {
    expect(await TauriStorageManager.kv.get("missing")).toBeNull();
  });

  it("JSON に見える文字列も、解釈せずにそのまま保存する", async () => {
    await TauriStorageManager.kv.set("raw", '{"nested":true}');

    expect(await TauriStorageManager.kv.get("raw")).toBe('{"nested":true}');
  });

  it("削除したキーは、取得できなくなる", async () => {
    await TauriStorageManager.kv.set("temp", "1");

    await TauriStorageManager.kv.remove("temp");

    expect(await TauriStorageManager.kv.get("temp")).toBeNull();
  });

  it("全件取得では、保存しているすべてのキーと値を返す", async () => {
    await TauriStorageManager.kv.set("a", "1");
    await TauriStorageManager.kv.set("b", "two");

    const all = await TauriStorageManager.kv.getAll();

    expect(all).toMatchObject({ a: "1", b: "two" });
  });

  describe("他の画面や窓での変更の通知", () => {
    it("別の窓で値が変わると、キーごとの古い値と新しい値を通知する", () => {
      const callback = vi.fn();
      TauriStorageManager.kv.onChanged!(callback);

      dispatchStorageEvent("notify-key", '"before"', '"after"');

      expect(callback).toHaveBeenCalledWith({
        "notify-key": { oldValue: "before", newValue: "after" },
      });
    });

    it("値が削除されたときは、新しい値を null として通知する", () => {
      const callback = vi.fn();
      TauriStorageManager.kv.onChanged!(callback);

      dispatchStorageEvent("removed-key", "1", null);

      expect(callback).toHaveBeenCalledWith({
        "removed-key": { oldValue: "1", newValue: null },
      });
    });

    it("保存領域の全消去（キーなしの通知）は、キー単位の通知として扱わない", () => {
      const callback = vi.fn();
      TauriStorageManager.kv.onChanged!(callback);

      dispatchStorageEvent(null, "x", null);

      expect(callback).not.toHaveBeenCalled();
    });

    it.each([
      ['"text"', "text"],
      ["42", "42"],
      ["true", "true"],
      ["plain text", "plain text"],
    ])("通知の値 %s は、文字列として %s に戻す", (raw, expected) => {
      const callback = vi.fn();
      TauriStorageManager.kv.onChanged!(callback);

      dispatchStorageEvent("typed-key", null, raw);

      expect(callback).toHaveBeenLastCalledWith({
        "typed-key": { oldValue: null, newValue: expected },
      });
    });
  });
});

describe("Tauri の IndexedDB のオブジェクトストア", () => {
  it("保存したレコードを、キー（url）で取得できる", async () => {
    const store = createStore();
    await store.put({ url: "https://example.com/a", title: "A" });

    expect(await store.get("https://example.com/a")).toEqual({
      url: "https://example.com/a",
      title: "A",
    });
  });

  it("同じキーで保存し直すと、レコードを置き換える", async () => {
    const store = createStore();
    await store.put({ url: "https://example.com/a", title: "古い" });
    await store.put({ url: "https://example.com/a", title: "新しい" });

    expect(await store.get("https://example.com/a")).toMatchObject({ title: "新しい" });
    expect(await store.count()).toBe(1);
  });

  it("存在しないキーの取得は undefined を返す", async () => {
    const store = createStore();

    expect(await store.get("https://example.com/none")).toBeUndefined();
  });

  it("削除したレコードは、取得できなくなる", async () => {
    const store = createStore();
    await store.put({ url: "https://example.com/a" });

    await store.delete("https://example.com/a");

    expect(await store.get("https://example.com/a")).toBeUndefined();
  });

  it("全件取得と件数の取得は、保存しているレコードすべてを対象にする", async () => {
    const store = createStore();
    await store.put({ url: "https://example.com/a" });
    await store.put({ url: "https://example.com/b" });

    expect(await store.getAll()).toHaveLength(2);
    expect(await store.count()).toBe(2);
  });

  it("全消去すると、レコードが残らない", async () => {
    const store = createStore();
    await store.put({ url: "https://example.com/a" });

    await store.clear();

    expect(await store.count()).toBe(0);
  });

  describe("インデックスによる検索", () => {
    async function seed() {
      const store = createStore();
      for (let n = 1; n <= 5; n += 1) {
        await store.put({
          url: `https://example.com/${n}`,
          last_updated: n,
          kind: n % 2 === 0 ? "thread" : "board",
        });
      }
      return store;
    }

    it("インデックスの範囲で絞り込んだレコードを返す", async () => {
      const store = await seed();

      const values = await store.index("last_updated").getAll(IDBKeyRange.lowerBound(3));

      expect(values.map((value) => (value as { last_updated: number }).last_updated)).toEqual([
        3, 4, 5,
      ]);
    });

    it("インデックスの範囲で絞り込んだキーだけを返す", async () => {
      const store = await seed();

      const keys = await store.index("last_updated").getAllKeys(IDBKeyRange.upperBound(2));

      expect(keys).toEqual(["https://example.com/1", "https://example.com/2"]);
    });

    it("ページ単位の取得では、件数の上限と続きの有無を返す", async () => {
      const store = await seed();

      const first = await store.index("last_updated").getPage({ limit: 2 });
      expect(first.values.map((value) => (value as { url: string }).url)).toEqual([
        "https://example.com/1",
        "https://example.com/2",
      ]);
      expect(first.hasMore).toBe(true);

      const last = await store.index("last_updated").getPage({ limit: 10, offset: 3 });
      expect(last.values).toHaveLength(2);
      expect(last.hasMore).toBe(false);
    });

    it("降順のページ取得では、新しいものから返す", async () => {
      const store = await seed();

      const page = await store.index("last_updated").getPage({ limit: 2, direction: "prev" });

      expect(page.values.map((value) => (value as { last_updated: number }).last_updated)).toEqual([
        5, 4,
      ]);
    });

    it("絞り込みの条件に合うレコードだけを、ページに数える", async () => {
      const store = await seed();

      const page = await store.index("last_updated").getPage({
        limit: 10,
        filter: { key: "kind", value: "thread" },
      });

      expect(page.values.map((value) => (value as { url: string }).url)).toEqual([
        "https://example.com/2",
        "https://example.com/4",
      ]);
      expect(page.hasMore).toBe(false);
    });
  });
});
