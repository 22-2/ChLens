import { BrowserHttpClient } from "src/app/platform/browser/HttpClient";
import { BrowserStorageManager } from "src/app/platform/browser/StorageManager";
import { BrowserWindowManager } from "src/app/platform/browser/WindowManager";
import { platformCookieManager } from "src/app/platform/CookieManager";
import { platformDownloadManager } from "src/app/platform/DownloadManager";
import {
  inheritTauriInternalsFromTopWindow,
  isTauriRuntime,
  isWebRuntime,
} from "src/app/platform/runtime";
import { TauriHttpClient } from "src/app/platform/tauri/HttpClient";
import { TauriStorageManager } from "src/app/platform/tauri/StorageManager";
import { TauriWindowManager } from "src/app/platform/tauri/WindowManager";
import { Platform } from "src/app/platform/types";
import { WebHttpClient } from "src/app/platform/web/HttpClient";

// Tauri v2は常に__TAURI_INTERNALSをメインウィンドウに注入する。
// iframeには注入されないため、同一オリジンのトップウィンドウから引き継ぐ。
inheritTauriInternalsFromTopWindow();

const isTauri = isTauriRuntime();
// 拡張機能とTauriは全ウィンドウ共有、Web試用版は画面ごとにHTTP要求を制限する。
const httpClient = isTauri ? TauriHttpClient : isWebRuntime() ? WebHttpClient : BrowserHttpClient;

export const platform: Platform = isTauri
  ? {
      window: TauriWindowManager,
      http: httpClient,
      download: platformDownloadManager,
      cookies: platformCookieManager,
      storage: TauriStorageManager,
    }
  : {
      window: BrowserWindowManager,
      http: httpClient,
      download: platformDownloadManager,
      cookies: platformCookieManager,
      storage: BrowserStorageManager,
    };
