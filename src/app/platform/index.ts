import { BrowserHttpClient } from "./browser/HttpClient";
import { BrowserStorageManager } from "./browser/StorageManager";
import { BrowserWindowManager } from "./browser/WindowManager";
import { Platform } from "./types";

/**
 * プラットフォーム依存のAPIを提供するオブジェクト
 *
 * 将来的にTauriへ移行する際は、ビルド設定や環境変数に応じて
 * Tauri用の実装に差し替えることができるようにします。
 */
export const platform: Platform = {
  window: BrowserWindowManager,
  http: BrowserHttpClient,
  storage: BrowserStorageManager,
};
