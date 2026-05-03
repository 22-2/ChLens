///<reference path="global.d.ts" />
import Config from "src/app/Config";

import { setupContainer } from "src/service-container/setup";

export { default as Callbacks } from "./app/Callbacks";
export * from "./app/Defer";
export { default as LocalStorage } from "./app/LocalStorage";
export * from "./app/Log";
export { default as message } from "./app/Message";
export * from "./app/Util";
export * from "./app/BrowserDetect";
export * from "./app/ImageExt";

import * as platformInternal from "src/app/platform";

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

// Core modules - previously in app_core.js
import { Point, QDollarRecognizer } from "src/core/$Q.ts";
import * as BBSMenu from "src/core/BBSMenu.js";
import Board from "src/core/Board.js";
import BoardService from "src/core/BoardService.js";
import * as BoardTitleSolver from "src/core/BoardTitleSolver.js";
import Bookmark from "src/core/Bookmark.ts";
import * as BookmarkEntryList from "src/core/BookmarkEntryList.ts";
import BrowserBookmarkEntryList from "src/core/BrowserBookmarkEntryList.ts";
import IDBBookmarkEntryList from "src/core/IDBBookmarkEntryList.ts";
import Cache from "src/core/Cache.js";
import * as ContextMenus from "src/core/ContextMenus.js";
import * as DOMData from "src/core/DOMData.js";
import * as History from "src/core/History.js";
import * as HTTP from "src/core/HTTP.ts";
import * as ImageReplaceDat from "src/core/ImageReplaceDat.js";
import * as util from "src/core/jsutil.js";
import * as NG from "src/core/NG.js";
import Notification from "src/core/Notification.js";
import * as ReadState from "src/core/ReadState.js";
import * as ReplaceStrTxt from "src/core/ReplaceStrTxt.js";
import SikiGuard from "src/core/SikiGuard.js";
import Thread from "src/core/Thread.js";
import ThreadSearch from "src/core/ThreadSearch.js";
import ThreadService from "src/core/ThreadService.js";
import * as URL from "src/core/URL.ts";
import * as Util from "src/core/Util.ts";
import * as WriteHistory from "src/core/WriteHistory.js";

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
  ContextMenus,
  DOMData,
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
      document.on("DOMContentLoaded", onload);
    } else {
      onload();
    }
  }
}
