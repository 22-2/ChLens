// @vitest-environment node
import "fake-indexeddb/auto";

import { BrowserStorageManager } from "src/app/platform/browser/StorageManager";
import { describeObjectStoreContract } from "src/test-support/object-store-contract";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

// webextension-polyfill の browser.storage.local をメモリ上に再現する。
// 変更は拡張機能の実際の仕様どおり、エリア名つきの変更通知として流す。
const storage = vi.hoisted(() => {
  type Change = { oldValue?: unknown; newValue?: unknown };
  type Listener = (changes: Record<string, Change>, area: string) => void;
  const values = new Map<string, unknown>();
  const listeners: Listener[] = [];
  const notify = (changes: Record<string, Change>, area = "local") => {
    for (const listener of listeners) listener(changes, area);
  };
  const local = {
    get: async (keys: string | null) => {
      if (keys === null) return Object.fromEntries(values);
      return values.has(keys) ? { [keys]: values.get(keys) } : {};
    },
    set: async (items: Record<string, unknown>) => {
      const changes: Record<string, Change> = {};
      for (const [key, newValue] of Object.entries(items)) {
        changes[key] = { oldValue: values.get(key), newValue };
        values.set(key, newValue);
      }
      notify(changes);
    },
    remove: async (key: string) => {
      const oldValue = values.get(key);
      values.delete(key);
      // 拡張機能の変更通知は、削除された値の newValue を省略する。
      notify({ [key]: { oldValue } });
    },
  };
  return {
    values,
    listeners,
    notify,
    api: {
      storage: {
        local,
        onChanged: {
          addListener: (listener: Listener) => {
            listeners.push(listener);
          },
        },
      },
    },
  };
});

vi.mock("webextension-polyfill", () => ({ default: storage.api }));

vi.mock("src/app/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }),
}));

/** 保存先のデータベースはスキーマ作成と接続キャッシュを持つため、テストごとに名前を分けて干渉させない。 */
let dbSeq = 0;
function createStore() {
  dbSeq += 1;
  return BrowserStorageManager.getStore(`browser-storage-test-${dbSeq}`);
}

describe("ブラウザ拡張機能の設定の保存（kv）", () => {
  beforeEach(() => {
    storage.values.clear();
  });

  it("保存した値を、そのままの文字列で取得できる", async () => {
    await BrowserStorageManager.kv.set("theme", "dark");

    expect(await BrowserStorageManager.kv.get("theme")).toBe("dark");
  });

  it("保存されていないキーは null を返す", async () => {
    expect(await BrowserStorageManager.kv.get("missing")).toBeNull();
  });

  it("削除したキーは、取得できなくなる", async () => {
    await BrowserStorageManager.kv.set("temp", "1");

    await BrowserStorageManager.kv.remove("temp");

    expect(await BrowserStorageManager.kv.get("temp")).toBeNull();
  });

  it("全件取得では、保存しているすべてのキーと値を返す", async () => {
    await BrowserStorageManager.kv.set("a", "1");
    await BrowserStorageManager.kv.set("b", "two");

    expect(await BrowserStorageManager.kv.getAll()).toEqual({ a: "1", b: "two" });
  });

  describe("設定の変更の通知", () => {
    it("値が変わると、古い値と新しい値をキーごとに通知する", async () => {
      const callback = vi.fn();
      BrowserStorageManager.kv.onChanged!(callback);
      await BrowserStorageManager.kv.set("notify-key", "before");

      await BrowserStorageManager.kv.set("notify-key", "after");

      expect(callback).toHaveBeenLastCalledWith({
        "notify-key": { oldValue: "before", newValue: "after" },
      });
    });

    it("値が削除されたときは、新しい値を null として通知する", async () => {
      const callback = vi.fn();
      BrowserStorageManager.kv.onChanged!(callback);
      await BrowserStorageManager.kv.set("removed-key", "1");

      await BrowserStorageManager.kv.remove("removed-key");

      expect(callback).toHaveBeenLastCalledWith({
        "removed-key": { oldValue: "1", newValue: null },
      });
    });

    it("local 以外の保存領域の変更は、通知しない", () => {
      const callback = vi.fn();
      BrowserStorageManager.kv.onChanged!(callback);

      storage.notify({ "sync-key": { oldValue: "a", newValue: "b" } }, "sync");

      expect(callback).not.toHaveBeenCalled();
    });
  });
});

describeObjectStoreContract("ブラウザ", createStore);
