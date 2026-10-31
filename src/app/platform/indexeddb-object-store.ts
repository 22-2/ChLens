import { createLogger } from "src/app/logger";
import type { ObjectStore, ObjectStoreIndex } from "src/app/platform/types";

const logger = createLogger("platform");

/**
 * IndexedDB をラップしたオブジェクトストア。Tauri 版とブラウザ版で同じ保存形式・検索結果を保つため、
 * 実装を一箇所にまとめている。接続は保存先の名前ごとにキャッシュする。
 */
export class IndexedDBObjectStore implements ObjectStore {
  private static dbCache = new Map<string, IDBDatabase>();

  constructor(private dbName: string) {}

  private async getDB(): Promise<IDBDatabase> {
    // 既存の接続をキャッシュから取得
    if (IndexedDBObjectStore.dbCache.has(this.dbName)) {
      const cachedDb = IndexedDBObjectStore.dbCache.get(this.dbName)!;
      // キャッシュされたDBが有効か確認
      if (!cachedDb.objectStoreNames.contains(this.dbName)) {
        // オブジェクトストアが存在しない場合はキャッシュをクリア
        IndexedDBObjectStore.dbCache.delete(this.dbName);
      } else {
        return cachedDb;
      }
    }

    // 新しい接続を作成
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 2);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const tx = (event.target as IDBOpenDBRequest).transaction;
        if (!tx) {
          reject(new Error("Transaction not available"));
          return;
        }

        // オブジェクトストアが存在しない場合は作成
        if (!db.objectStoreNames.contains(this.dbName)) {
          logger.debug(`Creating object store: ${this.dbName}`);
          const objStore = db.createObjectStore(this.dbName, {
            keyPath: "url",
          });
          objStore.createIndex("last_updated", "last_updated", {
            unique: false,
          });
          objStore.createIndex("last_modified", "last_modified", {
            unique: false,
          });
        }
      };
    });

    IndexedDBObjectStore.dbCache.set(this.dbName, db);
    return db;
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
      const req = db.transaction(this.dbName, "readwrite").objectStore(this.dbName).put(value);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.dbName, "readwrite").objectStore(this.dbName).delete(key);
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
      const req = db.transaction(this.dbName, "readwrite").objectStore(this.dbName).clear();
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

  index(name: string): ObjectStoreIndex {
    const getStore = async () => {
      const db = await this.getDB();
      return db.transaction(this.dbName).objectStore(this.dbName);
    };

    return {
      getAll: async (query?: unknown) => {
        const store = await getStore();
        return new Promise<unknown[]>((resolve, reject) => {
          const req = store
            .index(name)
            .getAll(query as IDBValidKey | IDBKeyRange | null | undefined);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });
      },
      getAllKeys: async (query?: unknown) => {
        const store = await getStore();
        return new Promise<unknown[]>((resolve, reject) => {
          const req = store
            .index(name)
            .getAllKeys(query as IDBValidKey | IDBKeyRange | null | undefined);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });
      },
      getPage: async ({ query, direction = "next", offset = 0, limit, filter }) => {
        const store = await getStore();
        return new Promise<{ values: unknown[]; hasMore: boolean }>((resolve, reject) => {
          const values: unknown[] = [];
          let matchedCount = 0;
          const req = store
            .index(name)
            .openCursor(query as IDBValidKey | IDBKeyRange | null | undefined, direction);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
              resolve({ values, hasMore: false });
              return;
            }
            const value = cursor.value as Record<string, unknown>;
            if (!filter || value[filter.key] === filter.value) {
              if (matchedCount >= offset) {
                if (values.length >= limit) {
                  resolve({ values, hasMore: true });
                  return;
                }
                values.push(value);
              }
              matchedCount += 1;
            }
            cursor.continue();
          };
        });
      },
    };
  }
}
