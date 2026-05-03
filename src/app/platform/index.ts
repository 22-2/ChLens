import { BrowserHttpClient } from "src/app/platform/browser/HttpClient";
import { BrowserStorageManager } from "src/app/platform/browser/StorageManager";
import { BrowserWindowManager } from "src/app/platform/browser/WindowManager";
import { TauriHttpClient } from "src/app/platform/tauri/HttpClient";
import { TauriStorageManager } from "src/app/platform/tauri/StorageManager";
import { TauriWindowManager } from "src/app/platform/tauri/WindowManager";
import { Platform } from "src/app/platform/types";

// Tauri v2は常に__TAURI_INTERNALSをメインウィンドウに注入する。
// iframeには注入されないため、同一オリジンのトップウィンドウから引き継ぐ。
if (typeof window !== "undefined" && self !== top) {
  try {
    if (
      !("__TAURI_INTERNALS__" in window) &&
      top != null &&
      "__TAURI_INTERNALS__" in top
    ) {
      (window as unknown as Record<string, unknown>)["__TAURI_INTERNALS__"] = (
        top as unknown as Record<string, unknown>
      )["__TAURI_INTERNALS__"];
    }
  } catch {
    // cross-originのiframeではtopへのアクセスが禁止されるため無視
  }
}

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const platform: Platform = isTauri
  ? {
      window: TauriWindowManager,
      http: TauriHttpClient,
      storage: TauriStorageManager,
    }
  : {
      window: BrowserWindowManager,
      http: BrowserHttpClient,
      storage: BrowserStorageManager,
    };
