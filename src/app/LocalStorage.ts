import {
  getStore2All,
  getStore2String,
  removeStore2Value,
  setStore2String,
} from "src/app/Store2Storage";

export default class LocalStorage {
  static async get(key: string, isJson = false): Promise<string | null> {
    const val = getStore2String(key);
    if (!val) return null;

    if (isJson) {
      return JSON.parse(val);
    }
    return val;
  }

  static async getAll(): Promise<Record<string, unknown>> {
    return getStore2All();
  }

  static async set(key: string, val: string, isJson = false) {
    const valueToStore = isJson ? JSON.stringify(val) : val;
    await setStore2String(key, valueToStore);
  }

  static async del(key: string) {
    await removeStore2Value(key);
  }
}
