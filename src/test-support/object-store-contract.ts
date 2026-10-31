import type { ObjectStore } from "src/app/platform/types";
import { describe, expect, it } from "vite-plus/test";

/**
 * オブジェクトストアの振る舞いを、実装によらず同じ基準で確かめる。
 * 呼び出し側は fake-indexeddb を先に読み込み、テストごとに別の保存先を返す createStore を渡す。
 */
export function describeObjectStoreContract(label: string, createStore: () => ObjectStore): void {
  describe(`${label} のIndexedDBのオブジェクトストア`, () => {
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

        expect(
          page.values.map((value) => (value as { last_updated: number }).last_updated),
        ).toEqual([5, 4]);
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
}
