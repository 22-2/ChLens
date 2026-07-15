import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { Entry, SyncableEntryList } from "src/core/BookmarkEntryList";

/**
 * IndexedDB を使ってブックマークを永続化する EntryList 実装。
 * Tauri 環境など browser.bookmarks API が利用できない場合に使用する。
 */

interface BookmarkDB extends DBSchema {
  Bookmark: {
    key: string;
    value: Entry;
    indexes: { type: string };
  };
}

const DB_NAME = "Bookmark";
const STORE_NAME = "Bookmark" as const;
const DB_VERSION = 1;

function getDB(): Promise<IDBPDatabase<BookmarkDB>> {
  return openDB<BookmarkDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: "url" });
      store.createIndex("type", "type", { unique: false });
    },
  });
}

export default class IDBBookmarkEntryList extends SyncableEntryList {
  readonly ready = new app.Callbacks();
  readonly needReconfigureRootNodeId = new app.Callbacks({ persistent: true });

  constructor() {
    super();
    void this._load();
  }

  private async _load(): Promise<void> {
    try {
      const db = await getDB();
      const entries = await db.getAll(STORE_NAME);
      for (const entry of entries) {
        await super.add(entry);
      }
    } catch (e) {
      app.log("error", `IDBBookmarkEntryList._load: 読み込みに失敗しました: ${String(e)}`);
    }
    if (!this.ready.wasCalled) {
      this.ready.call();
    }
  }

  private async _persist(entry: Entry): Promise<void> {
    try {
      const db = await getDB();
      await db.put(STORE_NAME, entry);
    } catch (e) {
      app.log("error", `IDBBookmarkEntryList._persist: 保存に失敗しました: ${String(e)}`);
    }
  }

  private async _delete(url: string): Promise<void> {
    try {
      const db = await getDB();
      await db.delete(STORE_NAME, url);
    } catch (e) {
      app.log("error", `IDBBookmarkEntryList._delete: 削除に失敗しました: ${String(e)}`);
    }
  }

  async add(entry: Entry): Promise<boolean> {
    entry = app.deepCopy(entry);
    if (!(await super.add(entry))) return false;
    await this._persist(entry);
    return true;
  }

  async update(entry: Entry): Promise<boolean> {
    entry = app.deepCopy(entry);
    if (!(await super.update(entry))) return false;
    await this._persist(entry);
    return true;
  }

  async remove(url: string): Promise<boolean> {
    if (!(await super.remove(url))) return false;
    await this._delete(url);
    return true;
  }
}
