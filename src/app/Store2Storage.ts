import store from "store2";
import type { StoreBase } from "store2";

function getNativeLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getStoreArea(): StoreBase {
  // 変更理由: テスト環境ではstore.localがfake領域へ退避することがあり、
  // localStorage操作と保存先が分離すると状態初期化・復元が不安定になる。
  const nativeLocalStorage = getNativeLocalStorage();
  if (nativeLocalStorage) {
    return store.area("chlens_local", nativeLocalStorage);
  }

  return store.local;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function getStore2String(key: string): string | null {
  const nativeLocalStorage = getNativeLocalStorage();
  if (nativeLocalStorage) {
    const raw = nativeLocalStorage.getItem(key);
    if (raw == null) {
      return null;
    }

    return raw;
  }

  const value = getStoreArea().get(key);
  if (value == null) {
    return null;
  }
  return toStringOrNull(value);
}

export function getStore2All(): Record<string, unknown> {
  const nativeLocalStorage = getNativeLocalStorage();
  if (nativeLocalStorage) {
    const allValues: Record<string, unknown> = {};
    for (let index = 0; index < nativeLocalStorage.length; index += 1) {
      const key = nativeLocalStorage.key(index);
      if (!key) {
        continue;
      }

      const raw = nativeLocalStorage.getItem(key);
      if (raw == null) {
        continue;
      }
      allValues[key] = raw;
    }
    return allValues;
  }

  return getStoreArea().getAll() as Record<string, unknown>;
}

export function setStore2String(key: string, value: string): Promise<void> {
  const nativeLocalStorage = getNativeLocalStorage();
  if (nativeLocalStorage) {
    // 変更理由: 既存コードはlocalStorage上の生文字列を前提にしているため、
    // store2のJSONエンコード形式ではなく従来フォーマットを維持する。
    // Promiseでラップすることで、キャッシュとストレージの同期を明示的に制御する。
    return Promise.resolve().then(() => {
      nativeLocalStorage.setItem(key, value);
    });
  }

  return Promise.resolve(getStoreArea().set(key, value));
}

export function setStore2Value(key: string, value: unknown): Promise<void> {
  const nativeLocalStorage = getNativeLocalStorage();
  if (nativeLocalStorage) {
    return Promise.resolve().then(() => {
      nativeLocalStorage.setItem(key, JSON.stringify(value));
    });
  }

  return Promise.resolve(getStoreArea().set(key, value));
}

export function removeStore2Value(key: string): Promise<void> {
  const nativeLocalStorage = getNativeLocalStorage();
  if (nativeLocalStorage) {
    return Promise.resolve().then(() => {
      nativeLocalStorage.removeItem(key);
    });
  }

  return Promise.resolve(getStoreArea().remove(key));
}

export function getStore2Keys(): string[] {
  const nativeLocalStorage = getNativeLocalStorage();
  if (nativeLocalStorage) {
    const keys: string[] = [];
    for (let index = 0; index < nativeLocalStorage.length; index += 1) {
      const key = nativeLocalStorage.key(index);
      if (key) {
        keys.push(key);
      }
    }
    return keys;
  }

  return getStoreArea().keys();
}
