import { IndexedDBObjectStore } from "src/app/platform/indexeddb-object-store";
import { KeyValueStore, ObjectStore, StorageManager } from "src/app/platform/types";
import {
  getStore2All,
  getStore2String,
  removeStore2Value,
  setStore2String,
} from "src/app/Store2Storage";

function parseStorageEventValue(rawValue: string | null): string | null {
  if (rawValue == null) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }
    if (typeof parsed === "number" || typeof parsed === "boolean") {
      return String(parsed);
    }
  } catch {
    // localStorageへ生文字列が入っている場合はそのまま扱う。
  }

  return rawValue;
}

// localStorageはTauri webview内でサンドボックスされており、
// 拡張機能のbrowser.storage.localと同様に永続化される
const TauriKeyValueStore: KeyValueStore = {
  async get(key: string): Promise<string | null> {
    return getStore2String(key);
  },

  async set(key: string, value: string): Promise<void> {
    void setStore2String(key, value);
  },

  async remove(key: string): Promise<void> {
    void removeStore2Value(key);
  },

  async getAll(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const allValues = getStore2All();
    for (const [key, value] of Object.entries(allValues)) {
      if (typeof value === "string") {
        result[key] = value;
        continue;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        result[key] = String(value);
      }
    }
    return result;
  },

  onChanged(
    callback: (
      changes: Record<string, { oldValue: string | null; newValue: string | null }>,
    ) => void,
  ): void {
    window.addEventListener("storage", (event) => {
      if (event.key !== null) {
        callback({
          [event.key]: {
            oldValue: parseStorageEventValue(event.oldValue),
            newValue: parseStorageEventValue(event.newValue),
          },
        });
      }
    });
  },
};

export const TauriStorageManager: StorageManager = {
  kv: TauriKeyValueStore,
  getStore(name: string): ObjectStore {
    return new IndexedDBObjectStore(name);
  },
};
