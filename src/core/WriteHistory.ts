import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { isHttps } from "src/core/URL";
import {
  getTauriRepositories,
  isTauriRuntime,
} from "src/core/TauriDrizzleBridge";
import { log, assertArg } from "src/app/Log";

const DB_NAME = "WriteHistory";
const STORE_NAME = "WriteHistory";
const DB_VERSION = 2;
const UNIX_TIME_201710 = 1506783600;

interface WriteHistoryRecord {
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

interface PersistedWriteHistoryRecord extends Omit<WriteHistoryRecord, "id"> {
  id: number;
}

interface WriteHistoryRecordWithHttps extends PersistedWriteHistoryRecord {
  isHttps: boolean;
}

interface WriteHistoryAddInput {
  url: string;
  res: number;
  title: string;
  name: string;
  mail: string;
  inputName?: string | null;
  inputMail?: string | null;
  message: string;
  date: number;
}

interface WriteHistoryDBSchema extends DBSchema {
  [STORE_NAME]: {
    key: number;
    value: WriteHistoryRecord;
    indexes: {
      url: string;
      res: number;
      title: string;
      date: number;
    };
  };
}

const parseErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const reportError = (context: string, error: unknown): never => {
  log("error", `${context}: ${parseErrorMessage(error)}`, error);
  throw new Error(parseErrorMessage(error));
};

const ensurePersistedRecord = (
  record: WriteHistoryRecord,
): PersistedWriteHistoryRecord => {
  if (record.id == null) {
    throw new Error("書込履歴レコードのIDが不正です");
  }

  return {
    id: record.id,
    url: record.url,
    res: record.res,
    title: record.title,
    name: record.name,
    mail: record.mail,
    input_name: record.input_name,
    input_mail: record.input_mail,
    message: record.message,
    date: record.date,
  };
};

const toRowsWithHttps = (
  rows: PersistedWriteHistoryRecord[],
): WriteHistoryRecordWithHttps[] => {
  return rows.map((value) => ({
    ...value,
    isHttps: isHttps(value.url),
  }));
};

let dbPromise: Promise<IDBPDatabase<WriteHistoryDBSchema>> | null = null;

const getDB = (): Promise<IDBPDatabase<WriteHistoryDBSchema>> => {
  if (dbPromise != null) {
    return dbPromise;
  }

  dbPromise = openDB<WriteHistoryDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        const objStore = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        objStore.createIndex("url", "url", { unique: false });
        objStore.createIndex("res", "res", { unique: false });
        objStore.createIndex("title", "title", { unique: false });
        objStore.createIndex("date", "date", { unique: false });
      }

      if (oldVersion === 1) {
        // 変更理由: 旧データ互換のため、過去フォーマットの日付だけを移行時に一括補正する。
        void (async () => {
          const index = tx.objectStore(STORE_NAME).index("date");
          let cursor = await index.openCursor(
            IDBKeyRange.lowerBound(UNIX_TIME_201710, true),
          );

          while (cursor) {
            const value = cursor.value;
            if (value.res > 1) {
              const date = new Date(+value.date);
              date.setMonth(date.getMonth() - 1);
              value.date = date.valueOf();
              await cursor.update(value);
            }
            cursor = await cursor.continue();
          }
        })();
      }
    },
  });

  return dbPromise;
};

const normalizePaging = (
  offset?: number,
  limit?: number,
): { offset: number; limit: number } => {
  return {
    offset: offset == null ? -1 : offset,
    limit: limit == null ? -1 : limit,
  };
};

const normalizeOffset = (offset?: number): number => {
  return offset == null ? -1 : offset;
};

const dayToUnixThreshold = (day: number): number => {
  return Date.now() - day * 24 * 60 * 60 * 1000;
};

const rejectInvalidArgs = (message: string): Promise<never> => {
  return Promise.reject(new Error(message));
};

const safeGetTauriWriteHistoryRepository = async () => {
  const { tauriWriteHistoryRepository } = await getTauriRepositories();
  return tauriWriteHistoryRepository;
};

const loadByDateDesc = async (
  offset: number,
  limit: number,
): Promise<WriteHistoryRecordWithHttps[]> => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME);
  const index = tx.store.index("date");
  let cursor = await index.openCursor(null, "prev");
  const rows: WriteHistoryRecordWithHttps[] = [];
  let skipped = 0;

  while (cursor && (limit === -1 || rows.length < limit)) {
    if (offset !== -1 && skipped < offset) {
      skipped += 1;
      cursor = await cursor.continue();
      continue;
    }

    const persisted = ensurePersistedRecord(cursor.value);
    rows.push({
      ...persisted,
      isHttps: isHttps(persisted.url),
    });
    cursor = await cursor.continue();
  }

  await tx.done;
  return rows;
};

const removeByUrlAndRes = async (url: string, res: number): Promise<void> => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const rows = await tx.store.index("url").getAll(url);

  for (const row of rows) {
    const persisted = ensurePersistedRecord(row);
    if (persisted.res === res) {
      await tx.store.delete(persisted.id);
    }
  }

  await tx.done;
};

const getRowsByUrl = async (url: string): Promise<PersistedWriteHistoryRecord[]> => {
  const db = await getDB();
  const rows = await db.getAllFromIndex(STORE_NAME, "url", url);
  return rows.map((row) => ensurePersistedRecord(row));
};

const getAllRows = async (): Promise<PersistedWriteHistoryRecord[]> => {
  const db = await getDB();
  const rows = await db.getAll(STORE_NAME);
  return rows.map((row) => ensurePersistedRecord(row));
};

const countRows = async (): Promise<number> => {
  const db = await getDB();
  return await db.count(STORE_NAME);
};

const clearAllRows = async (): Promise<void> => {
  const db = await getDB();
  await db.clear(STORE_NAME);
};

const clearByOffset = async (offset: number): Promise<void> => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  let cursor = await tx.store.openCursor();
  let skipped = 0;

  while (cursor) {
    if (skipped < offset) {
      skipped += 1;
      cursor = await cursor.continue();
      continue;
    }
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
};

const clearByDateBefore = async (dayUnix: number): Promise<void> => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const keys = await tx.store
    .index("date")
    .getAllKeys(IDBKeyRange.upperBound(dayUnix, true));

  for (const key of keys) {
    await tx.store.delete(key);
  }

  await tx.done;
};

const addToBrowserStore = async ({
  url,
  res,
  title,
  name,
  mail,
  inputName,
  inputMail,
  message,
  date,
}: WriteHistoryAddInput): Promise<void> => {
  const db = await getDB();
  await db.add(STORE_NAME, {
    url,
    res,
    title,
    name,
    mail,
    input_name: inputName != null ? inputName : name,
    input_mail: inputMail != null ? inputMail : mail,
    message,
    date,
  });
};

/**
@method add
@param {Object}
  @param {String} [url]
  @param {Number} [res]
  @param {String} [title]
  @param {String} [name]
  @param {String} [mail]
  @param {String} [inputName]
  @param {String} [inputMail]
  @param {String} [message]
  @param {Number} [date]
@return {Promise}
*/
export const add = async function ({
  url,
  res,
  title,
  name,
  mail,
  inputName = null,
  inputMail = null,
  message,
  date,
}: WriteHistoryAddInput): Promise<void> {
  if (
    assertArg("WriteHistory.add", [
      [url, "string"],
      [res, "number"],
      [title, "string"],
      [name, "string"],
      [mail, "string"],
      [inputName, "string", true],
      [inputMail, "string", true],
      [message, "string"],
      [date, "number"],
    ])
  ) {
    throw new Error("書込履歴に追加しようとしたデータが不正です");
  }

  try {
    if (isTauriRuntime()) {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      const tauriWriteHistoryRepository = await safeGetTauriWriteHistoryRepository();
      await tauriWriteHistoryRepository.add({
        url,
        res,
        title,
        name,
        mail,
        inputName: inputName != null ? inputName : name,
        inputMail: inputMail != null ? inputMail : mail,
        message,
        date,
      });
      return;
    }

    await addToBrowserStore({
      url,
      res,
      title,
      name,
      mail,
      inputName,
      inputMail,
      message,
      date,
    });
  } catch (e) {
    reportError("WriteHistory.add: データの格納に失敗しました", e);
  }
};

/**
@method remove
@param {String} url
@param {Number} res
@return {Promise}
*/
export const remove = async function (
  url: string,
  res: number,
): Promise<void> {
  if (
    assertArg("WriteHistory.remove", [
      [url, "string"],
      [res, "number"],
    ])
  ) {
    return Promise.reject(new Error("書込履歴から削除しようとしたデータが不正です"));
  }

  try {
    if (isTauriRuntime()) {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      const tauriWriteHistoryRepository = await safeGetTauriWriteHistoryRepository();
      await tauriWriteHistoryRepository.remove(url, res);
      return;
    }

    await removeByUrlAndRes(url, res);
  } catch (e) {
    reportError("WriteHistory.remove: トランザクション中断", e);
  }
};

/**
@method get
@param {Number} offset
@param {Number} limit
@return {Promise}
*/
export const get = function (
  offset?: number,
  limit?: number,
): Promise<WriteHistoryRecordWithHttps[]> {
  const normalized = normalizePaging(offset, limit);
  if (
    assertArg("WriteHistory.get", [
      [normalized.offset, "number"],
      [normalized.limit, "number"],
    ])
  ) {
    return rejectInvalidArgs("WriteHistory.get: 引数が不正です");
  }

  if (isTauriRuntime()) {
    // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
    return (async () => {
      const tauriWriteHistoryRepository = await safeGetTauriWriteHistoryRepository();
      const histories = await tauriWriteHistoryRepository.get(
        normalized.offset,
        normalized.limit,
      );
      return toRowsWithHttps(histories as PersistedWriteHistoryRecord[]);
    })();
  }

  return loadByDateDesc(normalized.offset, normalized.limit);
};

/**
@method getByUrl
@param {String} url
@return {Promise}
*/
export const getByUrl = async function (
  url: string,
): Promise<PersistedWriteHistoryRecord[]> {
  if (assertArg("WriteHistory.getByUrl", [[url, "string"]])) {
    throw new Error("書込履歴を取得しようとしたデータが不正です");
  }

  try {
    if (isTauriRuntime()) {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      const tauriWriteHistoryRepository = await safeGetTauriWriteHistoryRepository();
      const rows = await tauriWriteHistoryRepository.getByUrl(url);
      return rows as PersistedWriteHistoryRecord[];
    }

    return await getRowsByUrl(url);
  } catch (e) {
    return reportError("WriteHistory.getByUrl: トランザクション中断", e);
  }
};

/**
@method getAll
@return {Promise}
*/
export const getAll = async function (): Promise<PersistedWriteHistoryRecord[]> {
  try {
    if (isTauriRuntime()) {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      const tauriWriteHistoryRepository = await safeGetTauriWriteHistoryRepository();
      const rows = await tauriWriteHistoryRepository.getAll();
      return rows as PersistedWriteHistoryRecord[];
    }

    return await getAllRows();
  } catch (e) {
    return reportError("WriteHistory.getAll: トランザクション中断", e);
  }
};

/**
@method count
@return {Promise}
*/
export const count = async function (): Promise<number> {
  try {
    if (isTauriRuntime()) {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      const tauriWriteHistoryRepository = await safeGetTauriWriteHistoryRepository();
      return await tauriWriteHistoryRepository.count();
    }

    return await countRows();
  } catch (e) {
    return reportError("WriteHistory.count: トランザクション中断", e);
  }
};

/**
@method clear
@param {Number} offset
@return {Promise}
*/
export const clear = function (offset?: number): Promise<void> {
  const normalizedOffset = normalizeOffset(offset);
  if (assertArg("WriteHistory.clear", [[normalizedOffset, "number"]])) {
    return rejectInvalidArgs("WriteHistory.clear: 引数が不正です");
  }

  if (isTauriRuntime()) {
    // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
    return (async () => {
      const tauriWriteHistoryRepository = await safeGetTauriWriteHistoryRepository();
      await tauriWriteHistoryRepository.clear(normalizedOffset);
    })();
  }

  if (normalizedOffset === -1) {
    return clearAllRows();
  }

  return clearByOffset(normalizedOffset);
};

/**
@method clearRange
@param {Number} day
@return {Promise}
*/
export const clearRange = async function (day: number): Promise<void> {
  if (assertArg("WriteHistory.clearRange", [[day, "number"]])) {
    return rejectInvalidArgs("WriteHistory.clearRange: 引数が不正です");
  }

  const dayUnix = dayToUnixThreshold(day);
  try {
    if (isTauriRuntime()) {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      const tauriWriteHistoryRepository = await safeGetTauriWriteHistoryRepository();
      await tauriWriteHistoryRepository.clearRange(dayUnix);
      return;
    }

    await clearByDateBefore(dayUnix);
  } catch (e) {
    return reportError("WriteHistory.clearRange: トランザクション中断", e);
  }
};
