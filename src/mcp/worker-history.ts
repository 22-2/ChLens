import type { McpBrowsingHistoryRecord, McpWriteHistoryRecord } from "./history-output";

/**
 * サービスワーカーから閲覧履歴・書き込み履歴を読むための最小リポジトリ。
 *
 * 変更理由: 既存のHistory/WriteHistoryモジュールはUI向けのplatform分岐と
 * Tauri分岐を持ち、windowを持たないサービスワーカーからimportできない。
 * MCPブリッジはChrome拡張のサービスワーカーで動くため、ここでは
 * IndexedDBの読み取りだけを切り出して、既存の保存形式をそのまま再利用する。
 */
const HISTORY_DATABASE_NAME = "History";
const HISTORY_STORE_NAME = "History";
const HISTORY_DATABASE_VERSION = 2;

const WRITE_HISTORY_DATABASE_NAME = "WriteHistory";
const WRITE_HISTORY_STORE_NAME = "WriteHistory";
const WRITE_HISTORY_DATABASE_VERSION = 2;

interface StoredHistoryRecord {
  id?: number;
  url: string;
  title: string;
  date: number;
  boardTitle: string;
}

interface StoredWriteHistoryRecord {
  id?: number;
  url: string;
  res: number;
  title: string;
  name: string;
  mail: string;
  input_name: string;
  input_mail: string;
  message: string;
  date: number;
}

function openHistoryDatabase(name: string, version: number): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("サービスワーカーでIndexedDBを利用できません"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error ?? new Error("履歴データベースを開けません"));
    request.onsuccess = () => resolve(request.result);
  });
}

function matchesQuery(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

export async function listRecentBrowsingHistory(
  query: string,
  limit: number,
): Promise<McpBrowsingHistoryRecord[]> {
  const needle = query.trim().toLowerCase();
  const database = await openHistoryDatabase(HISTORY_DATABASE_NAME, HISTORY_DATABASE_VERSION);
  try {
    const records = await new Promise<StoredHistoryRecord[]>((resolve, reject) => {
      const request = database
        .transaction(HISTORY_STORE_NAME)
        .objectStore(HISTORY_STORE_NAME)
        .index("date")
        .openCursor(null, "prev");
      const rows: StoredHistoryRecord[] = [];
      // 変更理由: 閲覧履歴は同じスレを繰り返し開くと重複するため、
      // 直近の一覧としてはHistory.getUniqueと同じくURLで重複排除する。
      const seen = new Set<string>();
      request.onerror = () => reject(request.error ?? new Error("閲覧履歴を読み込めません"));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(rows);
          return;
        }
        const value = cursor.value as StoredHistoryRecord;
        if (
          typeof value.url === "string" &&
          !seen.has(value.url) &&
          (!needle ||
            matchesQuery(`${value.title ?? ""}\n${value.boardTitle ?? ""}\n${value.url}`, needle))
        ) {
          seen.add(value.url);
          rows.push(value);
        }
        if (rows.length >= limit) {
          resolve(rows);
          return;
        }
        cursor.continue();
      };
    });

    return records.map((record) => ({
      url: record.url,
      title: record.title ?? "",
      boardTitle: record.boardTitle ?? "",
      date: record.date ?? 0,
    }));
  } finally {
    database.close();
  }
}

export async function listRecentWriteHistory(
  query: string,
  limit: number,
): Promise<McpWriteHistoryRecord[]> {
  const needle = query.trim().toLowerCase();
  const database = await openHistoryDatabase(
    WRITE_HISTORY_DATABASE_NAME,
    WRITE_HISTORY_DATABASE_VERSION,
  );
  try {
    const records = await new Promise<StoredWriteHistoryRecord[]>((resolve, reject) => {
      const request = database
        .transaction(WRITE_HISTORY_STORE_NAME)
        .objectStore(WRITE_HISTORY_STORE_NAME)
        .index("date")
        .openCursor(null, "prev");
      const rows: StoredWriteHistoryRecord[] = [];
      request.onerror = () => reject(request.error ?? new Error("書き込み履歴を読み込めません"));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(rows);
          return;
        }
        const value = cursor.value as StoredWriteHistoryRecord;
        if (
          typeof value.url === "string" &&
          (!needle ||
            matchesQuery(`${value.title ?? ""}\n${value.message ?? ""}\n${value.url}`, needle))
        ) {
          rows.push(value);
        }
        if (rows.length >= limit) {
          resolve(rows);
          return;
        }
        cursor.continue();
      };
    });

    return records.map((record) => ({
      id: record.id ?? 0,
      url: record.url,
      res: record.res ?? 0,
      title: record.title ?? "",
      name: record.name ?? "",
      mail: record.mail ?? "",
      message: record.message ?? "",
      date: record.date ?? 0,
    }));
  } finally {
    database.close();
  }
}
