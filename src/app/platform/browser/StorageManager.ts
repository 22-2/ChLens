import { KeyValueStore, ObjectStore, StorageManager } from "src/app/platform/types";

/**
 * ブラウザ拡張機能環境用のKeyValueStore実装 (browser.storage.localを使用)
 */
const BrowserKeyValueStore: KeyValueStore = {
  async get(key: string): Promise<string | null> {
    const val = await browser.storage.local.get(key);
    return val[key] ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  },
  async remove(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  },
  async getAll(): Promise<Record<string, string>> {
    return await browser.storage.local.get(null);
  },
  onChanged(callback) {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        const result: Record<
          string,
          { oldValue: string | null; newValue: string | null }
        > = {};
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
 * ブラウザ拡張機能環境用のObjectStore実装 (IndexedDBをラップ)
 */
class BrowserObjectStore implements ObjectStore {
  constructor(private dbName: string) {}

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async get(key: string): Promise<any> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.dbName).objectStore(this.dbName).get(key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async put(value: any): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(this.dbName, "readwrite")
        .objectStore(this.dbName)
        .put(value);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(this.dbName, "readwrite")
        .objectStore(this.dbName)
        .delete(key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async getAll(): Promise<any[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.dbName).objectStore(this.dbName).getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(this.dbName, "readwrite")
        .objectStore(this.dbName)
        .clear();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async count(): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.dbName).objectStore(this.dbName).count();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  index(name: string) {
    const getStore = async () => {
      const db = await this.getDB();
      return db.transaction(this.dbName).objectStore(this.dbName);
    };

    return {
      getAll: async (query?: any) => {
        const store = await getStore();
        return new Promise<any[]>((resolve, reject) => {
          const req = store.index(name).getAll(query);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });
      },
      getAllKeys: async (query?: any) => {
        const store = await getStore();
        return new Promise<any[]>((resolve, reject) => {
          const req = store.index(name).getAllKeys(query);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });
      },
    };
  }
}

/**
 * ブラウザ拡張機能環境用のStorageManager実装
 */
export const BrowserStorageManager: StorageManager = {
  kv: BrowserKeyValueStore,
  getStore(name: string): ObjectStore {
    return new BrowserObjectStore(name);
  },
};
