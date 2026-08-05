import "ShortQuery.js";
import "webextension-polyfill";
///<reference path="global.d" />
import Config from "src/app/Config";

import { setupContainer } from "src/service-container/setup";

import * as platformInternal from "src/app/platform";

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

// 親ウィンドウからアクセスできるように内部configも公開
export { _config };

let _config: Config | undefined;
_config = new Config();

// 変更理由: Config は共有ストレージを監視して同期できるため、
// iframe でもローカルインスタンスを持たせて親依存を減らす。
export const config = new Proxy({} as Config, {
  get(_target, prop) {
    const actualConfig = _config;
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
import Cache from "src/core/Cache.js";
import * as History from "src/core/History";
import * as HTTP from "src/core/HTTP";
import IDBBookmarkEntryList from "src/core/IDBBookmarkEntryList";
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

type BookmarkEntryListRuntime = Bookmark["bel"] & {
  needReconfigureRootNodeId?: {
    add: (callback: () => void) => void;
    wasCalled: boolean;
  };
  setRootNodeId?: (rootNodeId: string) => Promise<boolean>;
};

type RuntimeAppShape = {
  config: Config;
  message: typeof messageInstance;
  bookmark?: Bookmark;
  bookmarkEntryList?: BookmarkEntryListRuntime;
};

const MISSING_BOOKMARK_ROOT_NODE_ID = "dummy";

let bookmarkRuntimeInitialized = false;

function resolveBookmarkRootNodeId(configInstance: Config): string {
  const bookmarkId = configInstance.get("bookmark_id");
  return typeof bookmarkId === "string" && bookmarkId.length > 0
    ? bookmarkId
    : MISSING_BOOKMARK_ROOT_NODE_ID;
}

function initializeBookmarkRuntime(target: RuntimeAppShape): void {
  if (bookmarkRuntimeInitialized) {
    return;
  }
  bookmarkRuntimeInitialized = true;

  target.config.ready(() => {
    if (!target.bookmark) {
      // 変更理由: bookmark は旧 browser view 側でのみ初期化されていたため、
      // new-ui 単独では外部 window に依存しないと永続ブックマークが動かなかった。
      target.bookmark = new Bookmark(resolveBookmarkRootNodeId(target.config));
    }

    const entryList = target.bookmark.bel as BookmarkEntryListRuntime;
    target.bookmarkEntryList = entryList;

    const notifyRootSelectionRequired = () => {
      target.message.send("bookmark_root_reconfigure_required");
    };

    entryList.needReconfigureRootNodeId?.add(notifyRootSelectionRequired);

    // 変更理由: persistent callback は過去の call を replay しないため、
    // 初期化直後に rootNodeId 不正が確定していたケースも UI へ明示的に伝える。
    if (entryList.needReconfigureRootNodeId?.wasCalled) {
      notifyRootSelectionRequired();
    }

    target.message.on("config_updated", ({ key, val }: { key?: string; val?: unknown }) => {
      if (key !== "bookmark_id") {
        return;
      }

      const rootNodeId =
        typeof val === "string" && val.length > 0 ? val : MISSING_BOOKMARK_ROOT_NODE_ID;

      void entryList.setRootNodeId?.(rootNodeId);
    });
  });
}

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

initializeBookmarkRuntime(appObj as unknown as RuntimeAppShape);

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
        const localApp = (window as unknown as { app: LegacyAppObject })
          .app as unknown as Parameters<typeof setupContainer>[0];
        setupContainer(localApp);

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
