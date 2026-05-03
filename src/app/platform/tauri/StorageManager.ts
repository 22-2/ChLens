import {
  KeyValueStore,
  ObjectStore,
  StorageManager,
} from "src/app/platform/types";

// localStorageはTauri webview内でサンドボックスされており、
// 拡張機能のbrowser.storage.localと同様に永続化される
const TauriKeyValueStore: KeyValueStore = {
  async get(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  },

  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  },

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  },

  async getAll(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      result[key] = localStorage.getItem(key)!;
    }
    return result;
  },

  onChanged(
    callback: (
      changes: Record<
        string,
        { oldValue: string | null; newValue: string | null }
      >,
    ) => void,
  ): void {
    window.addEventListener("storage", (event) => {
      if (event.key !== null) {
        callback({
          [event.key]: {
            oldValue: event.oldValue,
            newValue: event.newValue,
          },
        });
      }
    });
  },
};

// IndexedDBはTauri webviewでも利用可能
class TauriObjectStore implements ObjectStore {
  constructor(private dbName: string) {}

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async get(key: string): Promise<unknown> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.dbName).objectStore(this.dbName).get(key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async put(value: unknown): Promise<void> {
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

  async getAll(): Promise<unknown[]> {
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
      getAll: async (query?: IDBKeyRange) => {
        const store = await getStore();
        return new Promise<unknown[]>((resolve, reject) => {
          const req = store.index(name).getAll(query);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });
      },
      getAllKeys: async (query?: IDBKeyRange) => {
        const store = await getStore();
        return new Promise<unknown[]>((resolve, reject) => {
          const req = store.index(name).getAllKeys(query);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });
      },
    };
  }
}

export const TauriStorageManager: StorageManager = {
  kv: TauriKeyValueStore,
  getStore(name: string): ObjectStore {
    return new TauriObjectStore(name);
  },
};
