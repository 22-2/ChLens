import type { McpBrowsingHistoryRecord, McpWriteHistoryRecord } from "./history-output";
import { listByDateDesc, matchesQuery } from "./worker-db";

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

export async function listRecentBrowsingHistory(
  query: string,
  limit: number,
): Promise<McpBrowsingHistoryRecord[]> {
  const needle = query.trim().toLowerCase();
  const records = await listByDateDesc<StoredHistoryRecord>(
    HISTORY_DATABASE_NAME,
    HISTORY_STORE_NAME,
    {
      indexName: "date",
      limit,
      matches: (record) =>
        typeof record.url === "string" &&
        (!needle ||
          matchesQuery(`${record.title ?? ""}\n${record.boardTitle ?? ""}\n${record.url}`, needle)),
      // 変更理由: 閲覧履歴は同じスレを繰り返し開くと重複するため、
      // 直近の一覧としてはHistory.getUniqueと同じくURLで重複排除する。
      dedupeKey: (record) => record.url,
    },
    HISTORY_DATABASE_VERSION,
  );

  return records.map((record) => ({
    url: record.url,
    title: record.title ?? "",
    boardTitle: record.boardTitle ?? "",
    date: record.date ?? 0,
  }));
}

export async function listRecentWriteHistory(
  query: string,
  limit: number,
): Promise<McpWriteHistoryRecord[]> {
  const needle = query.trim().toLowerCase();
  const records = await listByDateDesc<StoredWriteHistoryRecord>(
    WRITE_HISTORY_DATABASE_NAME,
    WRITE_HISTORY_STORE_NAME,
    {
      indexName: "date",
      limit,
      matches: (record) =>
        typeof record.url === "string" &&
        (!needle ||
          matchesQuery(`${record.title ?? ""}\n${record.message ?? ""}\n${record.url}`, needle)),
    },
    WRITE_HISTORY_DATABASE_VERSION,
  );

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
}
