import { type IDBPDatabase, openDB } from "idb";

/**
 * サービスワーカー用のIndexedDBアクセスの共通ヘルパー。
 *
 * 変更理由: 既存のCache/History/WriteHistoryモジュールはUI向けの依存を
 * 推移的に引くため、windowを持たないサービスワーカーからimportできない。
 * 各worker用リポジトリが手書きのIndexedDBラッパーを重複実装していたため、
 * window非依存のidbへ寄せて重複を解消する。
 */

export interface DateDescListOptions<T> {
  /** 走査する降順インデックス名。Cacheはlast_updated、履歴系はdate。 */
  indexName: string;
  /** 返す最大件数。 */
  limit: number;
  /** 指定時は条件を満たすレコードだけを返す。 */
  matches?: (record: T) => boolean;
  /** 指定時は同じキーの重複を除く。新しい順に走査するため先勝ちになる。 */
  dedupeKey?: (record: T) => string;
  /** 指定時はこの日時範囲（start以上end未満）のレコードだけを走査する。 */
  dateRange?: DayRange;
}

/** 日付指定を変換した半開区間。start以上end未満。 */
export interface DayRange {
  start: number;
  end: number;
}

/**
 * YYYY-MM-DD形式の日付をブラウザ現地時間の半開区間へ変換する。
 * 未指定・空文字は範囲なし（null）を返す。不正形式は例外を投げる。
 */
export function resolveDayRange(date: string | undefined): DayRange | null {
  if (date == null || date.trim() === "") return null;
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!matched) {
    throw new Error("日付はYYYY-MM-DD形式で指定してください");
  }
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0).getTime();
  const startDate = new Date(start);
  // 変更理由: 存在しない日付（2月30日など）はDateが翌月へ繰り上げるため、
  // 構成要素を比較して沈黙のずれを防ぐ。endは翌日0時で求め、夏時間の切替日もずれない。
  if (
    Number.isNaN(start) ||
    startDate.getFullYear() !== year ||
    startDate.getMonth() !== month - 1 ||
    startDate.getDate() !== day
  ) {
    throw new Error("存在しない日付です");
  }
  return { start, end };
}

export type WorkerDatabaseUpgrade = (database: IDBPDatabase<unknown>) => void;

export async function openWorkerDatabase(
  databaseName: string,
  version: number,
  upgrade?: WorkerDatabaseUpgrade,
): Promise<IDBPDatabase<unknown>> {
  if (typeof indexedDB === "undefined") {
    throw new Error("サービスワーカーでIndexedDBを利用できません");
  }
  return openDB(databaseName, version, upgrade == null ? undefined : { upgrade });
}

/**
 * 指定インデックスを新しい順に走査し、条件に合うレコードを最大limit件返す。
 */
export async function listByDateDesc<T>(
  databaseName: string,
  storeName: string,
  options: DateDescListOptions<T>,
  version = 2,
): Promise<T[]> {
  const database = await openWorkerDatabase(databaseName, version);
  try {
    if (!database.objectStoreNames.contains(storeName)) {
      // 変更理由: 履歴が一度も保存されていない新規プロファイルでは
      // ストア自体が存在しない。読み取りのためだけに空DBを作らず、空配列を返す。
      return [];
    }
    const index = database
      .transaction(storeName, "readonly")
      .objectStore(storeName)
      .index(options.indexName);
    const keyRange = options.dateRange
      ? IDBKeyRange.bound(options.dateRange.start, options.dateRange.end, false, true)
      : null;
    let cursor = await index.openCursor(keyRange, "prev");
    const rows: T[] = [];
    const seen = new Set<string>();
    while (cursor) {
      const record = cursor.value as T;
      const key = options.dedupeKey?.(record);
      if ((key == null || !seen.has(key)) && (options.matches == null || options.matches(record))) {
        if (key != null) seen.add(key);
        rows.push(record);
        if (rows.length >= options.limit) break;
      }
      cursor = await cursor.continue();
    }
    return rows;
  } finally {
    database.close();
  }
}

/** 小文字化済みのneedleで部分一致する。呼び出し側でqueryを小文字化して渡す。 */
export function matchesQuery(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 100;

/** 履歴系のlimitを1〜100へ正規化する。不正値は既定の20へ倒す。 */
export function normalizeHistoryLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_HISTORY_LIMIT;
  return Math.min(MAX_HISTORY_LIMIT, Math.max(1, Math.floor(limit as number)));
}
