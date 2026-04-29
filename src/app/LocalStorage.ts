import { platform } from "src/app";

export default class LocalStorage {
  static async get(key: string, isJson = false): Promise<string | null> {
    const val = await platform.storage.kv.get(key);
    if (!val) return null;

    if (isJson) {
      return JSON.parse(val);
    }
    return val;
  }

  static async getAll(): Promise<Record<string, string | number>> {
    return await platform.storage.kv.getAll();
  }

  static async set(key: string, val: string, isJson = false) {
    const valueToStore = isJson ? JSON.stringify(val) : val;
    await platform.storage.kv.set(key, valueToStore);
  }

  static async del(key: string) {
    await platform.storage.kv.remove(key);
  }
}
