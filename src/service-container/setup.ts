import { container } from "src/service-container/Container";
import {
  IBBSMenuService,
  IBoardResult,
  IBoardService,
  IBookmark,
  ICacheItem,
  ICacheService,
  IConfig,
  IMessage,
  INGService,
  INotificationService,
  IReadStateService,
  IThreadService,
  IUtil,
} from "src/service-container/interfaces";
// @ts-ignore
import Cache from "src/core/Cache.js";
// @ts-ignore
import BoardService from "src/core/BoardService.js";
// @ts-ignore
import * as BBSMenu from "src/core/BBSMenu.js";
// @ts-ignore
import ThreadService from "src/core/ThreadService.js";

/**
 * Initializes the service container with the current app implementations.
 * This should be called during the application boot process.
 */
export function setupContainer(app: any) {
  // Config Adapter
  const configAdapter: IConfig = {
    get: (key: string) => app.config.get(key),
    set: (key: string, val: any) => app.config.set(key, val),
    ready: (cb: () => void) => app.config.ready(cb),
  };

  // Message Adapter
  const messageAdapter: IMessage = {
    send: (type: string, data?: any) => app.message.send(type, data),
    on: (type: string, cb: (data: any) => void) => app.message.on(type, cb),
  };

  // Bookmark Adapter
  const bookmarkAdapter: IBookmark = {
    get: (url: string) => app.bookmark.get(url),
    add: (item: any) => app.bookmark.add(item),
    remove: (url: string) => app.bookmark.remove(url),
    updateResCount: (url: string, count: number) =>
      app.bookmark.updateResCount(url, count),
    updateExpired: (url: string, exp: boolean) =>
      app.bookmark.updateExpired(url, exp),
    getByBoard: (url: string) => app.bookmark.getByBoard(url),
  };

  // Cache Adapter
  const cacheServiceAdapter: ICacheService = {
    getCache: (path: string): ICacheItem => {
      return new Cache(path) as ICacheItem;
    },
  };

  // ReadState Adapter
  const readStateAdapter: IReadStateService = {
    get: (url: string) => app.ReadState.get(url),
    getByBoard: (boardUrl: string) => app.ReadState.getByBoard(boardUrl),
    set: (readState: any) => app.ReadState.set(readState),
  };

  // Board Service Adapter
  const boardServiceAdapter: IBoardService = {
    getThreads: (url: any): Promise<IBoardResult> =>
      BoardService.getThreads(url),
    getCachedResCount: (url: any) => BoardService.getCachedResCount(url),
  };

  // BBSMenu Service Adapter
  const bbsMenuServiceAdapter: IBBSMenuService = {
    get: (forceReload?: boolean) => BBSMenu.get(forceReload),
  };

  // Thread Service Adapter
  const threadServiceAdapter: IThreadService = {
    getThread: (url, options) => ThreadService.getThread(url, options),
  };

  // Notification Service Adapter
  const notificationServiceAdapter: INotificationService = {
    notify: (message, options) => {
      const data: any = {};
      if (options?.html) {
        data.html = message;
      } else {
        data.message = message;
      }
      if (options?.backgroundColor) {
        data.background_color = options.backgroundColor;
      }
      app.message.send("notify", data);
    },
    success: (message) => {
      app.message.send("notify", { message, background_color: "green" });
    },
    error: (message) => {
      app.message.send("notify", { message, background_color: "red" });
    },
    info: (message) => {
      app.message.send("notify", { message, background_color: "#777" });
    },
  };

  // NG Service Adapter
  const ngServiceAdapter: INGService = {
    isNGBoard: (title, url, resCount) => app.NG.isNGBoard(title, url, resCount),
    isNGThread: (res, title, url) => app.NG.isNGThread(res, title, url),
    isThreadIgnoreNgType: (res, threadTitle, url, ngType) =>
      app.NG.isThreadIgnoreNgType(res, threadTitle, url, ngType),
    add: (ngWord) => app.NG.add(ngWord),
    invalidateCache: () => app.NG.invalidateCache(),
    execExpire: () => app.NG.execExpire(),
    isIgnoreResNumForAuto: (num, type) =>
      app.NG.isIgnoreResNumForAuto(num, type),
  };

  // Util Adapter
  const utilAdapter: IUtil = {
    escapeHtml: (str: string) => app.escapeHtml(str),
    safeHref: (url: string) => app.safeHref(url),
    defer: () => app.defer(),
    isNewerReadState: (a: any, b: any) => app.util.isNewerReadState(a, b),
    guessType: (url: string) =>
      app.util.guessType
        ? app.util.guessType(url)
        : { bbsType: "2ch", protocol: "https:" },
  };

  container.config = configAdapter;
  container.message = messageAdapter;
  container.bookmark = bookmarkAdapter;
  container.cache = cacheServiceAdapter;
  container.util = utilAdapter;
  container.readState = readStateAdapter;
  container.board = boardServiceAdapter;
  container.bbsMenu = bbsMenuServiceAdapter;
  container.thread = threadServiceAdapter;
  container.notification = notificationServiceAdapter;
  container.ng = ngServiceAdapter;
}
