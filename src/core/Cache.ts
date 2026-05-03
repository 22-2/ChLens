import { platform } from "src/app";
import type { ObjectStore } from "src/app/platform/types";

interface CacheData {
  url: string;
  data: string | null;
  parsed: unknown | null;
  last_updated: number;
  last_modified: number | null;
  etag: string | null;
  res_length: number | null;
  dat_size: number | null;
  readcgi_ver: number | null;
}

/**
 * キャッシュデータを管理するクラス
 * IndexedDBを使用して、通信結果をローカルに保存します
 */
export default class Cache {
  key: string;
  data: string | null = null;
  parsed: unknown | null = null;
  lastUpdated: number | null = null;
  lastModified: number | null = null;
  etag: string | null = null;
  resLength: number | null = null;
  datSize: number | null = null;
  readcgiVer: number | null = null;

  // 静的なIndexedDB接続
  private static _dbOpen: Promise<IDBDatabase> | undefined;

  /**
   * IndexedDBの初期化を実行します
   */
  private static async _initDB(): Promise<IDBDatabase> {
    if (this._dbOpen) {
      return this._dbOpen;
    }

    this._dbOpen = new Promise((resolve, reject) => {
      const req = indexedDB.open("Cache", 1);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const tx = (event.target as IDBOpenDBRequest).transaction;
        if (!tx) {
          reject(new Error("Transaction not available"));
          return;
        }

        // オブジェクトストアを作成
        const objStore = db.createObjectStore("Cache", { keyPath: "url" });
        objStore.createIndex("last_updated", "last_updated", {
          unique: false,
        });
        objStore.createIndex("last_modified", "last_modified", {
          unique: false,
        });

        tx.oncomplete = () => resolve(db);
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
    });

    return this._dbOpen;
  }

  constructor(key: string) {
    this.key = key;
  }

  /**
   * ストアを取得します
   */
  private static _getStore(): ObjectStore {
    return platform.storage.getStore("Cache");
  }

  /**
   * キャッシュの件数を取得します
   */
  static async count(): Promise<number> {
    return this._getStore().count();
  }

  /**
   * 全キャッシュを削除します
   */
  static async delete(): Promise<void> {
    await this._getStore().clear();
  }

  /**
   * 指定日数以上古いキャッシュを削除します
   */
  static async clearRange(day: number): Promise<void> {
    const dayUnix = Date.now() - day * 24 * 60 * 60 * 1000;
    const store = this._getStore();
    const keys = await store
      .index("last_updated")
      .getAllKeys(IDBKeyRange.upperBound(dayUnix, true));
    await Promise.all(keys.map((key) => store.delete(key as string)));
  }

  /**
   * キャッシュを取得します
   */
  async get(): Promise<void> {
    try {
      const result = await Cache._getStore().get(this.key);
      if (result == null) {
        throw new Error("キャッシュが存在しません");
      }

      // 結果をこのインスタンスのプロパティにマップ
      const data = result as Record<string, unknown>;
      for (const key in data) {
        const val = data[key];
        const newKey = this._mapKey(key);
        (this as Record<string, unknown>)[newKey] = val ?? null;
      }
    } catch (e) {
      const error = e as Error;
      if (error.message !== "キャッシュが存在しません") {
        console.error("Cache::get: トランザクション中断", error);
      }
      throw e;
    }
  }

  /**
   * キャッシュを保存します
   */
  async put(
    data?: string,
    options?: { lastModified?: number; etag?: string },
  ): Promise<void> {
    // 引数が渡された場合はプロパティを更新
    if (data !== undefined) {
      this.data = data;
      this.lastUpdated = Date.now();
    }
    if (options?.lastModified !== undefined) {
      this.lastModified = options.lastModified;
    }
    if (options?.etag !== undefined) {
      this.etag = options.etag;
    }

    // データの妥当性を検証
    if (!this._validateData()) {
      throw new Error("キャッシュしようとしたデータが不正です");
    }

    // NULLを空白に置換
    const dataToStore =
      this.data != null ? this.data.replaceAll("\u0000", "\u0020") : null;

    try {
      await Cache._getStore().put({
        url: this.key,
        data: dataToStore,
        parsed: this.parsed || null,
        last_updated: this.lastUpdated,
        last_modified: this.lastModified || null,
        etag: this.etag || null,
        res_length: this.resLength || null,
        dat_size: this.datSize || null,
        readcgi_ver: this.readcgiVer || null,
      });
    } catch (e) {
      console.error("Cache::put: トランザクション中断", e);
      throw e;
    }
  }

  /**
   * キャッシュを削除します
   */
  async delete(): Promise<void> {
    try {
      await Cache._getStore().delete(this.key);
    } catch (e) {
      console.error("Cache::delete: トランザクション中断");
      throw e;
    }
  }

  /**
   * データベース上のキー名を、インスタンスプロパティ名にマップします
   */
  private _mapKey(key: string): string {
    const keyMap: Record<string, string> = {
      last_updated: "lastUpdated",
      last_modified: "lastModified",
      res_length: "resLength",
      dat_size: "datSize",
      readcgi_ver: "readcgiVer",
    };
    return keyMap[key] ?? key;
  }

  /**
   * キャッシュデータの妥当性を検証します
   */
  private _validateData(): boolean {
    // keyは必須
    if (typeof this.key !== "string") {
      return false;
    }

    // dataまたはparsedのいずれかは必須
    const hasData =
      (this.data != null && typeof this.data === "string") ||
      (this.parsed != null && typeof this.parsed === "object");
    if (!hasData) {
      return false;
    }

    // lastUpdatedは必須
    if (typeof this.lastUpdated !== "number") {
      return false;
    }

    // optional なフィールドの型チェック
    if (this.lastModified != null && typeof this.lastModified !== "number") {
      return false;
    }
    if (this.etag != null && typeof this.etag !== "string") {
      return false;
    }
    if (this.resLength != null && !Number.isFinite(this.resLength)) {
      return false;
    }
    if (this.datSize != null && !Number.isFinite(this.datSize)) {
      return false;
    }
    if (this.readcgiVer != null && !Number.isFinite(this.readcgiVer)) {
      return false;
    }

    return true;
  }
}
