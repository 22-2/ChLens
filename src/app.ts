import "webextension-polyfill";
import "ShortQuery.js";
///<reference path="global.d" />
import Config from "src/app/Config";

import { setupContainer } from "src/service-container/setup";

import * as platformInternal from "src/app/platform";

export { default as Callbacks } from "./app/Callbacks";
export * from "./app/Defer";
export { default as LocalStorage } from "./app/LocalStorage";
export * from "./app/Log";
export { default as message } from "./app/Message";
export * from "./app/Util";
export * from "./app/BrowserDetect";
export * from "./app/ImageExt";

import { log, criticalError, assertArg } from "./app/Log";
import { defer } from "./app/Defer";
import { deepCopy, replaceAll, escapeHtml, safeHref } from "./app/Util";
import messageInstance from "./app/Message";
import CallbacksClass from "./app/Callbacks";
import LocalStorageClass from "./app/LocalStorage";

// Create global app object early to satisfy legacy code
const appObj: any = {
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
(window as any).app = appObj;


// iframe内外で統一的にplatformにアクセスできるようにProxyを使用
export const platform = new Proxy({} as typeof platformInternal.platform, {
  get(_target, prop) {
    // iframeはTauriのIPC橋がないため__TAURIがwindowに存在せず、
    // platformInternal.platformがBrowserHttpClientになる。
    // そのため親ウィンドウのplatformを優先して使用する。
    const actualPlatform =
      (self !== top && (parent as any).app?.platform) ||
      platformInternal.platform;
    if (!actualPlatform) {
      console.error("platform is not initialized");
      return undefined;
    }
    return actualPlatform[prop as keyof typeof platformInternal.platform];
  },
});

// 親ウィンドウからアクセスできるように内部configも公開
export { _config };

let _config: Config | undefined;
if (!frameElement) {
  _config = new Config();
}

// iframe内外で統一的にconfigにアクセスできるようにProxyを使用
export const config = new Proxy({} as Config, {
  get(_target, prop) {
    const actualConfig =
      _config || (self !== top && (parent as any).app?._config);
    if (!actualConfig) {
      console.error("config is not initialized");
      return undefined;
    }
    return actualConfig[prop as keyof Config];
  },
});

appObj.platform = platform;
appObj.config = config;
appObj._config = _config;

// Core modules - previously in app_core.js
import { Point, QDollarRecognizer } from "src/core/$Q";
import * as BBSMenu from "src/core/BBSMenu.js";
import Board from "src/core/Board.js";
import BoardService from "src/core/BoardService.js";
import * as BoardTitleSolver from "src/core/BoardTitleSolver.js";
import Bookmark from "src/core/Bookmark";
import * as BookmarkEntryList from "src/core/BookmarkEntryList";
import BrowserBookmarkEntryList from "src/core/BrowserBookmarkEntryList";
import IDBBookmarkEntryList from "src/core/IDBBookmarkEntryList";
import Cache from "src/core/Cache.js";
import * as History from "src/core/History";
import * as HTTP from "src/core/HTTP";
import * as ImageReplaceDat from "src/core/ImageReplaceDat.js";
import * as util from "src/core/jsutil.js";
import * as NG from "src/core/NG";
import Notification from "src/core/Notification";
import * as ReadState from "src/core/ReadState.js";
import * as ReplaceStrTxt from "src/core/ReplaceStrTxt.js";
import SikiGuard from "src/core/SikiGuard.js";
import Thread from "src/core/Thread.js";
import ThreadSearch from "src/core/ThreadSearch.js";
import ThreadService from "src/core/ThreadService.js";
import * as URL from "src/core/URL";
import * as Util from "src/core/Util";
import * as WriteHistory from "src/core/WriteHistory";

// Populate app object with core modules
Object.assign(appObj, {
  BBSMenu,
  Board,
  BoardService,
  BoardTitleSolver,
  Bookmark,
  BookmarkEntryList,
  BrowserBookmarkEntryList,
  IDBBookmarkEntryList,
  Cache,
  History,
  HTTP,
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
  util,
  Util,
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
  IDBBookmarkEntryList,
  Cache,
  History,
  HTTP,
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
  util,
  Util,
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

export async function boot(
  path: string,
  requirements: Function | string[] | null,
  fn: Function,
) {
  if (!fn && typeof requirements === "function") {
    fn = requirements;
    requirements = null;
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

    const onload = () => {
      config.ready(() => {
        setupContainer(parent.app || (window as any).app);

        if (!requirements) {
          fn();
          return;
        }

        const modules: any[] = [];
        for (const module of <string[]>requirements) {
          modules.push(parent.app[module]);
        }
        fn(...modules);
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
