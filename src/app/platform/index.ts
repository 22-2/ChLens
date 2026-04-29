import { BrowserHttpClient } from "src/app/platform/browser/HttpClient";
import { BrowserStorageManager } from "src/app/platform/browser/StorageManager";
import { BrowserWindowManager } from "src/app/platform/browser/WindowManager";
import { Platform } from "src/app/platform/types";

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
