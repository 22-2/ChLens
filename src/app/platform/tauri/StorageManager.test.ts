import "fake-indexeddb/auto";

import { TauriStorageManager } from "src/app/platform/tauri/StorageManager";
import { describeObjectStoreContract } from "src/test-support/object-store-contract";
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

describeObjectStoreContract("Tauri", createStore);
