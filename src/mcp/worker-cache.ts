import type { ParsedThread } from "@chlen/ch-lib";

import {
  listByDateDesc,
  matchesQuery,
  openWorkerDatabase,
  type WorkerDatabaseUpgrade,
} from "./worker-db";

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

const ensureCacheStore: WorkerDatabaseUpgrade = (database) => {
  if (!database.objectStoreNames.contains(STORE_NAME)) {
    const store = database.createObjectStore(STORE_NAME, { keyPath: "url" });
    store.createIndex("last_updated", "last_updated", { unique: false });
    store.createIndex("last_modified", "last_modified", { unique: false });
  }
};

export async function getWorkerCache(key: string): Promise<WorkerCacheRecord | null> {
  const database = await openWorkerDatabase(DATABASE_NAME, DATABASE_VERSION, ensureCacheStore);
  try {
    const record = (await database.get(STORE_NAME, key)) as WorkerCacheRecord | undefined;
    return record ?? null;
  } finally {
    database.close();
  }
}

export async function putWorkerCache(record: WorkerCacheRecord): Promise<void> {
  const database = await openWorkerDatabase(DATABASE_NAME, DATABASE_VERSION, ensureCacheStore);
  try {
    await database.put(STORE_NAME, {
      ...record,
      // IndexedDBへNULを保存すると既存のCache.putと挙動がずれるため、同じ置換を行う。
      data: record.data?.replaceAll("\u0000", " ") ?? null,
    });
  } finally {
    database.close();
  }
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
  const records = await listByDateDesc<WorkerCacheRecord>(
    DATABASE_NAME,
    STORE_NAME,
    {
      // 変更理由: 閲覧ログの一覧は最終取得日時の降順が正のため、
      // Cacheストアのlast_updatedインデックスを直接走査する。
      indexName: "last_updated",
      limit,
      matches: (record) => {
        if (record.kind !== "thread") return false;
        if (!needle) return true;
        const data = record.data ?? "";
        const parsed = record.parsed ? JSON.stringify(record.parsed) : "";
        return matchesQuery(
          `${record.title ?? ""}\n${record.thread_url ?? ""}\n${data}\n${parsed}`,
          needle,
        );
      },
    },
    DATABASE_VERSION,
  );

  return records.map(toLogRecord);
}
