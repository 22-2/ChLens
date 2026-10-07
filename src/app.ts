import "webextension-polyfill";

///<reference path="global.d" />
import * as platformInternal from "src/app/platform";
import { config, configInstance as _config } from "src/service-container/config-instance";
import { getBookmarkRuntime, setupContainer } from "src/service-container/setup";

export * from "./app/BrowserDetect";
export { default as Callbacks } from "./app/Callbacks";
export * from "./app/Defer";
export * from "./app/ImageExt";
export { default as LocalStorage } from "./app/LocalStorage";
export * from "./app/Log";
export { default as message } from "./app/Message";
export * from "./app/Util";

import CallbacksClass from "src/app/Callbacks";
import { defer } from "src/app/Defer";
import LocalStorageClass from "src/app/LocalStorage";
import { assertArg, criticalError, log } from "src/app/Log";
import messageInstance from "src/app/Message";
import { deepCopy, escapeHtml, replaceAll, safeHref } from "src/app/Util";

type LegacyAppObject = {
  log: typeof log;
  criticalError: typeof criticalError;
  assertArg: typeof assertArg;
  defer: typeof defer;
  deepCopy: typeof deepCopy;
  replaceAll: typeof replaceAll;
  escapeHtml: typeof escapeHtml;
  safeHref: typeof safeHref;
  message: typeof messageInstance;
  Callbacks: typeof CallbacksClass;
  LocalStorage: typeof LocalStorageClass;
  [key: string]: unknown;
};

// Create global app object early to satisfy legacy code
const appObj: LegacyAppObject = {
  log,
  criticalError,
  assertArg,
  defer,
  deepCopy,
  replaceAll,
  escapeHtml,
  safeHref,
  message: messageInstance,
  Callbacks: CallbacksClass,
  LocalStorage: LocalStorageClass,
};
(window as unknown as { app: LegacyAppObject }).app = appObj;

// runtime.ts 側で必要な内部値は吸収済みなので、new-ui は常にローカル platform を使う。
export const platform = new Proxy({} as typeof platformInternal.platform, {
  get(_target, prop) {
    const actualPlatform = platformInternal.platform;
    if (!actualPlatform) {
      console.error("platform is not initialized");
      return undefined;
    }
    return actualPlatform[prop as keyof typeof platformInternal.platform];
  },
});

// 親ウィンドウからアクセスできる互換APIとして内部configも公開する。
export { _config, config };

appObj.platform = platform;
appObj.config = config;
appObj._config = _config;

// Core modules - previously in app_core.js
import { Point, QDollarRecognizer } from "src/core/$Q";
import * as BBSMenu from "src/core/BBSMenu";
import Board from "src/core/Board";
import BoardService from "src/core/BoardService";
import * as BoardTitleSolver from "src/core/BoardTitleSolver";
import Bookmark from "src/core/Bookmark";
import * as BookmarkEntryList from "src/core/BookmarkEntryList";
import BrowserBookmarkEntryList from "src/core/BrowserBookmarkEntryList";
import Cache from "src/core/Cache";
import * as History from "src/core/History";
import * as HTTP from "src/core/HTTP";
import IDBBookmarkEntryList from "src/core/IDBBookmarkEntryList";
import * as ImageReplaceDat from "src/core/ImageReplaceDat";
import * as util from "src/core/jsutil";
import * as NG from "src/core/NG";
import Notification from "src/core/Notification";
import * as ReadState from "src/core/ReadState";
import * as ReplaceStrTxt from "src/core/ReplaceStrTxt";
import SikiGuard from "src/core/SikiGuard";
import Thread from "src/core/Thread";
import ThreadSearch from "src/core/ThreadSearch";
import ThreadService from "src/core/ThreadService";
import * as URL from "src/core/URL";
import * as Util from "src/core/Util";
import * as WriteHistory from "src/core/WriteHistory";

// window.app には実際に参照される旧互換APIだけを残す。
Object.assign(appObj, {
  History,
  ReadState,
  WriteHistory,
});

appObj.boot = boot; // Will be defined later

export {
  BBSMenu,
  Board,
  BoardService,
  BoardTitleSolver,
  Bookmark,
  BookmarkEntryList,
  BrowserBookmarkEntryList,
  Cache,
  History,
  HTTP,
  IDBBookmarkEntryList,
  ImageReplaceDat,
  NG,
  Notification,
  Point,
  QDollarRecognizer,
  ReadState,
  ReplaceStrTxt,
  SikiGuard,
  Thread,
  ThreadSearch,
  ThreadService,
  URL,
  Util,
  util,
  WriteHistory,
};

export const manifest = (async () => {
  // ブラウザ拡張の環境では拡張マニフェストを取得するが、
  // Tauriやローカル実行など拡張APIが無い環境では失敗させず
  // フォールバックでHTML側のバージョン情報を返す。
  if (!/^(?:chrome|moz)-extension:$/.test(location.protocol)) {
    try {
      const response = await fetch("/manifest.json");
      return await response.json();
    } catch {
      return { version: document.documentElement.dataset.appVersion || "" };
    }
  }

  try {
    const response = await fetch("/manifest.json");
    return await response.json();
  } catch (e) {
    console.error("manifest.json fetch failed:", e);
    return { version: document.documentElement.dataset.appVersion || "" };
  }
})();

type BootCallback = (...modules: unknown[]) => void;
type BootRequirements = BootCallback | string[] | null;

export async function boot(
  path: string,
  requirements: BootRequirements,
  fn?: BootCallback,
): Promise<void> {
  let callback = fn;
  const moduleNames = Array.isArray(requirements) ? requirements : null;
  if (callback == null && typeof requirements === "function") {
    callback = requirements;
  }

  // Chromeがiframeのsrcと無関係な内容を読み込むバグへの対応
  if (frameElement && (<HTMLIFrameElement>frameElement).src !== location.href) {
    location.href = (<HTMLIFrameElement>frameElement).src;
    return;
  }

  if (location.pathname === path) {
    const htmlVersion = document.documentElement.dataset.appVersion!;
    if ((await manifest).version !== htmlVersion) {
      location.reload();
      return;
    }

    const bootCallback = callback;
    if (bootCallback == null) {
      return;
    }

    const onload = () => {
      config.ready(() => {
        setupContainer();
        const localApp = (window as unknown as { app: LegacyAppObject }).app;
        const bookmarkRuntime = getBookmarkRuntime();
        if (bookmarkRuntime) {
          // ブックマーク移行中の旧画面とroot設定UIが参照する互換APIを維持する。
          localApp.bookmark = bookmarkRuntime;
          localApp.bookmarkEntryList = bookmarkRuntime.bel;
        }

        if (moduleNames == null) {
          bootCallback();
          return;
        }

        const modules: unknown[] = [];
        const modulesByName = localApp as unknown as Record<string, unknown>;
        for (const module of moduleNames) {
          modules.push(modulesByName[module]);
        }
        bootCallback(...modules);
      });
    };

    // async関数のためDOMContentLoadedに間に合わないことがある
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onload);
    } else {
      onload();
    }
  }
}
