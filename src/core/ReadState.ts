import { indexedDBRequestToPromise } from "src/core/jsutil.js";
import { URL } from "src/core/URL";
import type { IReadState } from "src/service-container/interfaces";

const DB_VERSION = 2;

interface ReadStateRecord extends IReadState {
  board_url?: string;
}

interface UrlFilterResult {
  original: URL;
  replaced: URL;
}

const appAny = app as any;

const _openDB: Promise<IDBDatabase> = new Promise((resolve, reject) => {
  const req = indexedDB.open("ReadState", DB_VERSION);
  req.onerror = (e) => {
    appAny.criticalError("既読情報管理システムの起動に失敗しました");
    reject(e);
  };
  req.onupgradeneeded = (event) => {
    const target = event.target as IDBOpenDBRequest;
    const db = target.result;
    const tx = target.transaction;
    const oldVer = event.oldVersion;

    if (oldVer < 1) {
      const objStore = db.createObjectStore("ReadState", { keyPath: "url" });
      objStore.createIndex("board_url", "board_url", { unique: false });
      tx!.oncomplete = () => {
        resolve(db);
      };
    }
    if (oldVer === 1) {
      void _recoveryOfDate(db, tx as IDBTransaction);
      tx!.oncomplete = () => {
        resolve(db);
      };
    }
  };
  req.onsuccess = (event) => {
    const target = event.target as IDBOpenDBRequest;
    resolve(target.result);
  };
});

const _urlFilter = (originalUrlStr: string): UrlFilterResult => {
  const original = new URL(originalUrlStr);
  const replaced = new URL(originalUrlStr);
  if (original.hostname.endsWith(".5ch.io")) {
    replaced.hostname = "*.5ch.io";
  }

  return { original, replaced };
};

export const set = async (readState: ReadStateRecord): Promise<void> => {
  if (readState == null || typeof readState !== "object") {
    appAny.log("error", "app.ReadState.set: 引数が不正です", readState);
    throw new Error("既読情報に登録しようとしたデータが不正です");
  }

  if (
    appAny.assertArg("app.ReadState.set", [
      [readState.url, "string"],
      [readState.last, "number"],
      [readState.read, "number"],
      [readState.received, "number"],
      [readState.offset, "number", true],
      [readState.date, "number", true],
    ])
  ) {
    throw new Error("既読情報に登録しようとしたデータが不正です");
  }

  const nextReadState = appAny.deepCopy(readState) as ReadStateRecord;

  const url = _urlFilter(nextReadState.url);
  nextReadState.url = url.replaced.href;
  const boardUrl = url.original.toBoard();
  nextReadState.board_url = _urlFilter(boardUrl.href).replaced.href;

  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState", "readwrite")
      .objectStore("ReadState")
      .put(nextReadState);
    await indexedDBRequestToPromise(req);

    delete nextReadState.board_url;
    nextReadState.url = url.original.href;
    appAny.message.send("read_state_updated", {
      board_url: boardUrl.href,
      read_state: nextReadState,
    });
  } catch (e) {
    appAny.log("error", "app.ReadState.set: トランザクション失敗");
    throw new Error(String(e));
  }
};

export const get = async (url: string): Promise<ReadStateRecord | null> => {
  if (appAny.assertArg("app.read_state.get", [[url, "string"]])) {
    throw new Error("既読情報を取得しようとしたデータが不正です");
  }

  const filteredUrl = _urlFilter(url);

  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState")
      .objectStore("ReadState")
      .get(filteredUrl.replaced.href);
    const {
      target: { result },
    } = (await indexedDBRequestToPromise(req)) as {
      target: { result: ReadStateRecord | null };
    };

    const data = appAny.deepCopy(result) as ReadStateRecord | null;
    if (data != null) {
      data.url = filteredUrl.original.href;
    }
    return data;
  } catch (e) {
    appAny.log("error", "app.ReadState.get: トランザクション中断");
    throw new Error(String(e));
  }
};

export const getAll = async (): Promise<ReadStateRecord[]> => {
  try {
    const db = await _openDB;
    const req = db.transaction("ReadState").objectStore("ReadState").getAll();
    const event = (await indexedDBRequestToPromise(req)) as {
      target: { result: ReadStateRecord[] };
    };
    return event.target.result;
  } catch (e) {
    appAny.log("error", "app.ReadState.getAll: トランザクション中断");
    throw new Error(String(e));
  }
};

export const getByBoard = async (url: string): Promise<ReadStateRecord[]> => {
  if (appAny.assertArg("app.ReadState.getByBoard", [[url, "string"]])) {
    throw new Error("既読情報を取得しようとしたデータが不正です");
  }

  const filteredUrl = _urlFilter(url);

  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState")
      .objectStore("ReadState")
      .index("board_url")
      .getAll(IDBKeyRange.only(filteredUrl.replaced.href));

    const {
      target: { result: data },
    } = (await indexedDBRequestToPromise(req)) as {
      target: { result: ReadStateRecord[] };
    };

    for (const readState of data) {
      readState.url = readState.url.replace(
        filteredUrl.replaced.origin,
        filteredUrl.original.origin,
      );
    }

    return data;
  } catch (e) {
    appAny.log("error", "app.ReadState.getByBoard: トランザクション中断");
    throw new Error(String(e));
  }
};

export const remove = async (url: string): Promise<void> => {
  if (appAny.assertArg("app.ReadState.remove", [[url, "string"]])) {
    throw new Error("既読情報を削除しようとしたデータが不正です");
  }

  const filteredUrl = _urlFilter(url);

  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState", "readwrite")
      .objectStore("ReadState")
      .delete(filteredUrl.replaced.href);
    await indexedDBRequestToPromise(req);
    appAny.message.send("read_state_removed", {
      url: filteredUrl.original.href,
    });
  } catch (e) {
    appAny.log("error", "app.ReadState.remove: トランザクション中断");
    throw new Error(String(e));
  }
};

export const clear = async (): Promise<void> => {
  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState", "readwrite")
      .objectStore("ReadState")
      .clear();
    await indexedDBRequestToPromise(req);
  } catch (e) {
    appAny.log("error", "app.ReadState.clear: トランザクション中断");
    throw new Error(String(e));
  }
};

const _recoveryOfDate = (_db: IDBDatabase, tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    const req = tx.objectStore("ReadState").openCursor();
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
        .result;
      if (cursor) {
        const value = cursor.value as ReadStateRecord;
        value.date = undefined;
        cursor.update(value);
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = (e) => {
      appAny.log(
        "error",
        "app.ReadState._recoveryOfDate: トランザクション中断",
      );
      reject(e);
    };
  });
