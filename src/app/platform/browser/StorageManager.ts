import { IndexedDBObjectStore } from "src/app/platform/indexeddb-object-store";
import { KeyValueStore, ObjectStore, StorageManager } from "src/app/platform/types";
import browser from "webextension-polyfill";

/**
 * ブラウザ拡張機能環境用のKeyValueStore実装 (browser.storage.localを使用)
 */
const BrowserKeyValueStore: KeyValueStore = {
  async get(key: string): Promise<string | null> {
    const val = await browser.storage.local.get(key);
    return (val[key] as string) ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  },
  async remove(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  },
  async getAll(): Promise<Record<string, string>> {
    return (await browser.storage.local.get(null)) as Record<string, string>;
  },
  onChanged(callback) {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        const result: Record<string, { oldValue: string | null; newValue: string | null }> = {};
        for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
          result[key] = {
            oldValue: (oldValue as string) ?? null,
            newValue: (newValue as string) ?? null,
          };
        }
        callback(result);
      }
    });
  },
};

/**
 * ブラウザ拡張機能環境用のStorageManager実装
 */
export const BrowserStorageManager: StorageManager = {
  kv: BrowserKeyValueStore,
  getStore(name: string): ObjectStore {
    return new IndexedDBObjectStore(name);
  },
};
