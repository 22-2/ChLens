import { platform } from "src/app";
import type { ObjectStore } from "src/app/platform/types";
import {
  getTauriRepositories,
  isTauriRuntime,
} from "src/core/TauriDrizzleBridge";
import { isHttps } from "src/core/URL";

/**
 * キャッシュデータを管理するクラス
 * IndexedDBを使用して、通信結果をローカルに保存します
 */
/**
 * ログ一覧用のメタ情報付きキャッシュレコード。
 * kind==="thread" のスレッドキャッシュ（＝閲覧ログ）のみを対象とする。
 */
export interface LogRecord {
  /** キャッシュキー（dat パス）。識別子として使う。 */
  url: string;
  /** スレを再表示するための read.cgi 形式 URL。 */
  threadUrl: string;
  title: string;
  boardUrl: string;
  boardTitle: string;
  resLength: number | null;
  datSize: number | null;
  lastUpdated: number;
  isHttps: boolean;
}

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
  // 変更理由: 閲覧ログ機能のため、スレのメタ情報をキャッシュに同居させる。
  // kind でスレ(thread)を板/bbsmenu/短縮URL等の他キャッシュと区別し、ログ一覧の対象を絞る。
  title: string | null = null;
  threadUrl: string | null = null;
  boardUrl: string | null = null;
  boardTitle: string | null = null;
  kind: string | null = null;

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
    // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
    if (isTauriRuntime()) {
      const { tauriCacheRepository } = await getTauriRepositories();
      return tauriCacheRepository.count();
    }

    return this._getStore().count();
  }

  /**
   * 全キャッシュを削除します
   */
  static async delete(): Promise<void> {
    // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
    if (isTauriRuntime()) {
      const { tauriCacheRepository } = await getTauriRepositories();
      await tauriCacheRepository.clear();
      return;
    }

    await this._getStore().clear();
  }

  /**
   * 指定日数以上古いキャッシュを削除します。
   * 変更理由: 閲覧ログ(kind==="thread")は恒久保存の対象なので、自動掃除では消さない。
   */
  static async clearRange(day: number): Promise<void> {
    const dayUnix = Date.now() - day * 24 * 60 * 60 * 1000;

    // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
    if (isTauriRuntime()) {
      const { tauriCacheRepository } = await getTauriRepositories();
      await tauriCacheRepository.clearOlderThan(dayUnix);
      return;
    }

    const store = this._getStore();
    const rows = (await store
      .index("last_updated")
      .getAll(IDBKeyRange.upperBound(dayUnix, true))) as Array<{
      url: string;
      kind?: string | null;
    }>;
    await Promise.all(
      rows
        .filter((row) => row.kind !== "thread")
        .map((row) => store.delete(row.url)),
    );
  }

  /**
   * 閲覧ログ(kind==="thread")の一覧を最終取得日時の降順で返します。
   */
  static async listLogs(offset = 0, limit = -1): Promise<LogRecord[]> {
    // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
    if (isTauriRuntime()) {
      const { tauriCacheRepository } = await getTauriRepositories();
      const rows = await tauriCacheRepository.listLogs(offset, limit);
      return rows.map((row) => Cache._toLogRecord(row));
    }

    // BrowserObjectStore はカーソル非対応のため、last_updated index で
    // 昇順取得 → 反転して降順にし、kind=thread のみ抽出する。
    const store = this._getStore();
    const all = (await store.index("last_updated").getAll()) as Array<
      Record<string, unknown>
    >;
    const logs = all
      .filter((row) => row.kind === "thread")
      .sort(
        (a, b) =>
          ((b.last_updated as number) ?? 0) -
          ((a.last_updated as number) ?? 0),
      )
      .map((row) =>
        Cache._toLogRecord({
          url: row.url as string,
          title: (row.title as string) ?? null,
          threadUrl: (row.thread_url as string) ?? null,
          boardUrl: (row.board_url as string) ?? null,
          boardTitle: (row.board_title as string) ?? null,
          resLength: (row.res_length as number) ?? null,
          datSize: (row.dat_size as number) ?? null,
          lastUpdated: (row.last_updated as number) ?? 0,
        }),
      );

    const start = offset < 0 ? 0 : offset;
    const end = limit < 0 ? logs.length : start + limit;
    return logs.slice(start, end);
  }

  /**
   * 閲覧ログ(kind==="thread")のみを削除します（板/bbsmenu等の他キャッシュは残す）。
   */
  static async deleteLogs(): Promise<void> {
    // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
    if (isTauriRuntime()) {
      const { tauriCacheRepository } = await getTauriRepositories();
      await tauriCacheRepository.deleteLogs();
      return;
    }

    const store = this._getStore();
    const all = (await store.getAll()) as Array<{
      url: string;
      kind?: string | null;
    }>;
    await Promise.all(
      all
        .filter((row) => row.kind === "thread")
        .map((row) => store.delete(row.url)),
    );
  }

  /**
   * 閲覧ログ(kind==="thread")の本文を全文検索し、最終取得日時の降順で返します。
   * ブラウザは保存済み dat/parsed を線形スキャン、Tauri は SQL の LIKE で検索する。
   */
  static async searchLogs(query: string): Promise<LogRecord[]> {
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return Cache.listLogs();
    }

    // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
    if (isTauriRuntime()) {
      const { tauriCacheRepository } = await getTauriRepositories();
      const rows = await tauriCacheRepository.searchLogs(query.trim());
      return rows.map((row) => Cache._toLogRecord(row));
    }

    const store = this._getStore();
    const all = (await store.getAll()) as Array<Record<string, unknown>>;
    const matched = all
      .filter((row) => row.kind === "thread")
      .filter((row) => {
        const data = typeof row.data === "string" ? row.data : "";
        // read.cgi(HTML)スレは data が無く parsed に本文を持つため、両方を対象にする。
        const parsed =
          row.parsed != null ? JSON.stringify(row.parsed) : "";
        const title = typeof row.title === "string" ? row.title : "";
        return `${title}\n${data}\n${parsed}`.toLowerCase().includes(needle);
      })
      .sort(
        (a, b) =>
          ((b.last_updated as number) ?? 0) -
          ((a.last_updated as number) ?? 0),
      )
      .map((row) =>
        Cache._toLogRecord({
          url: row.url as string,
          title: (row.title as string) ?? null,
          threadUrl: (row.thread_url as string) ?? null,
          boardUrl: (row.board_url as string) ?? null,
          boardTitle: (row.board_title as string) ?? null,
          resLength: (row.res_length as number) ?? null,
          datSize: (row.dat_size as number) ?? null,
          lastUpdated: (row.last_updated as number) ?? 0,
        }),
      );
    return matched;
  }

  private static _toLogRecord(row: {
    url: string;
    title: string | null;
    threadUrl: string | null;
    boardUrl: string | null;
    boardTitle: string | null;
    resLength: number | null;
    datSize: number | null;
    lastUpdated: number;
  }): LogRecord {
    // 旧データ救済: thread_url 未保存の古いログは dat キー url で代替する。
    const threadUrl = row.threadUrl ?? row.url;
    return {
      url: row.url,
      threadUrl,
      title: row.title ?? "",
      boardUrl: row.boardUrl ?? "",
      boardTitle: row.boardTitle ?? "",
      resLength: row.resLength,
      datSize: row.datSize,
      lastUpdated: row.lastUpdated,
      isHttps: isHttps(threadUrl),
    };
  }

  /**
   * キャッシュを取得します
   */
  async get(): Promise<void> {
    try {
      if (isTauriRuntime()) {
        // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
        const { tauriCacheRepository } = await getTauriRepositories();
        const result = await tauriCacheRepository.get(this.key);
        if (result == null) {
          throw new Error("キャッシュが存在しません");
        }

        this.data = result.data;
        this.parsed = result.parsed;
        this.lastUpdated = result.lastUpdated;
        this.lastModified = result.lastModified;
        this.etag = result.etag;
        this.resLength = result.resLength;
        this.datSize = result.datSize;
        this.readcgiVer = result.readcgiVer;
        this.title = result.title ?? null;
        this.threadUrl = result.threadUrl ?? null;
        this.boardUrl = result.boardUrl ?? null;
        this.boardTitle = result.boardTitle ?? null;
        this.kind = result.kind ?? null;
        return;
      }

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
      if (isTauriRuntime()) {
        // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
        const { tauriCacheRepository } = await getTauriRepositories();
        await tauriCacheRepository.put({
          url: this.key,
          data: dataToStore,
          parsed: this.parsed || null,
          lastUpdated: this.lastUpdated!,
          lastModified: this.lastModified || null,
          etag: this.etag || null,
          resLength: this.resLength || null,
          datSize: this.datSize || null,
          readcgiVer: this.readcgiVer || null,
          title: this.title || null,
          threadUrl: this.threadUrl || null,
          boardUrl: this.boardUrl || null,
          boardTitle: this.boardTitle || null,
          kind: this.kind || null,
        });
        return;
      }

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
        title: this.title || null,
        thread_url: this.threadUrl || null,
        board_url: this.boardUrl || null,
        board_title: this.boardTitle || null,
        kind: this.kind || null,
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
      if (isTauriRuntime()) {
        // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
        const { tauriCacheRepository } = await getTauriRepositories();
        await tauriCacheRepository.remove(this.key);
        return;
      }

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
      thread_url: "threadUrl",
      board_url: "boardUrl",
      board_title: "boardTitle",
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
