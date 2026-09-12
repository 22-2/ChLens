import type { ParsedThread } from "../core/ThreadParser";

/**
 * Chrome拡張のCacheストアをサービスワーカーから扱うための最小リポジトリ。
 *
 * 変更理由: 既存のCacheクラスはUI向けのplatform proxyとTauri分岐を持ち、
 * windowを持たないサービスワーカーからimportできない。保存形式は変えず、
 * ここではIndexedDBの読み書きだけを切り出して、既存ログをそのまま再利用する。
 */
const DATABASE_NAME = "Cache";
const DATABASE_VERSION = 2;
const STORE_NAME = "Cache";

export interface WorkerCacheRecord {
  url: string;
  data: string | null;
  parsed: ParsedThread | null;
  last_updated: number | null;
  last_modified: number | null;
  etag: string | null;
  res_length: number | null;
  dat_size: number | null;
  readcgi_ver: number | null;
  title: string | null;
  thread_url: string | null;
  board_url: string | null;
  board_title: string | null;
  kind: string | null;
}

export interface WorkerLogRecord {
  url: string;
  threadUrl: string;
  title: string;
  boardTitle: string;
  resLength: number | null;
  lastUpdated: number;
}

function createDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("サービスワーカーでIndexedDBを利用できません"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Cacheデータベースを開けません"));
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      const transaction = (event.target as IDBOpenDBRequest).transaction;
      if (!transaction) {
        reject(new Error("Cacheデータベースの更新トランザクションがありません"));
        return;
      }
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "url" });
        store.createIndex("last_updated", "last_updated", { unique: false });
        store.createIndex("last_modified", "last_modified", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readAllRecords(): Promise<WorkerCacheRecord[]> {
  const database = await createDatabase();
  return await new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onerror = () => reject(request.error ?? new Error("Cacheログを読み込めません"));
    request.onsuccess = () => resolve(request.result as WorkerCacheRecord[]);
  });
}

export async function getWorkerCache(key: string): Promise<WorkerCacheRecord | null> {
  const database = await createDatabase();
  return await new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(key);
    request.onerror = () => reject(request.error ?? new Error("Cacheを読み込めません"));
    request.onsuccess = () => resolve((request.result as WorkerCacheRecord | undefined) ?? null);
  });
}

export async function putWorkerCache(record: WorkerCacheRecord): Promise<void> {
  const database = await createDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put({
        ...record,
        // IndexedDBへNULを保存すると既存のCache.putと挙動がずれるため、同じ置換を行う。
        data: record.data?.replaceAll("\u0000", " ") ?? null,
      });
    request.onerror = () => reject(request.error ?? new Error("Cacheを保存できません"));
    request.onsuccess = () => resolve();
  });
}

function toLogRecord(record: WorkerCacheRecord): WorkerLogRecord {
  return {
    url: record.url,
    // 古いログにはthread_urlがないため、既存Cacheと同じくdatキーを代替にする。
    threadUrl: record.thread_url ?? record.url,
    title: record.title ?? "",
    boardTitle: record.board_title ?? "",
    resLength: record.res_length,
    lastUpdated: record.last_updated ?? 0,
  };
}

export async function listWorkerLogs(query: string, limit: number): Promise<WorkerLogRecord[]> {
  const needle = query.trim().toLowerCase();
  const records = await readAllRecords();
  const matched = records
    .filter((record) => record.kind === "thread")
    .filter((record) => {
      if (!needle) return true;
      const data = record.data ?? "";
      const parsed = record.parsed ? JSON.stringify(record.parsed) : "";
      return `${record.title ?? ""}\n${record.thread_url ?? ""}\n${data}\n${parsed}`
        .toLowerCase()
        .includes(needle);
    })
    .sort((left, right) => (right.last_updated ?? 0) - (left.last_updated ?? 0));

  return matched.slice(0, limit).map(toLogRecord);
}
