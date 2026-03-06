import { container } from "./Container";
import { IConfig, ICacheService, IBookmark, IMessage, ICacheItem, IReadStateService, IBoardService, IUtil, IBoardResult, IBBSMenuService, INotificationService } from "./interfaces";
// @ts-ignore
import Cache from "../core/Cache.js";
// @ts-ignore
import BoardService from "../core/BoardService.js";
// @ts-ignore
import * as BBSMenu from "../core/BBSMenu.js";

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
    updateResCount: (url: string, count: number) => app.bookmark.updateResCount(url, count),
    updateExpired: (url: string, exp: boolean) => app.bookmark.updateExpired(url, exp),
    getByBoard: (url: string) => app.bookmark.getByBoard(url),
  };

  // Cache Adapter
  const cacheServiceAdapter: ICacheService = {
    getCache: (path: string): ICacheItem => {
      return new Cache(path) as ICacheItem;
    }
  };

  // ReadState Adapter
  const readStateAdapter: IReadStateService = {
    get: (url: string) => app.ReadState.get(url),
    getByBoard: (boardUrl: string) => app.ReadState.getByBoard(boardUrl),
    set: (readState: any) => app.ReadState.set(readState),
  };

  // Board Service Adapter
  const boardServiceAdapter: IBoardService = {
    getThreads: (url: any): Promise<IBoardResult> => BoardService.getThreads(url),
  };

  // BBSMenu Service Adapter
  const bbsMenuServiceAdapter: IBBSMenuService = {
    get: (forceReload?: boolean) => BBSMenu.get(forceReload),
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
    }
  };

  // Util Adapter
  const utilAdapter: IUtil = {
    escapeHtml: (str: string) => app.escapeHtml(str),
    safeHref: (url: string) => app.safeHref(url),
    defer: () => app.defer(),
    isNewerReadState: (a: any, b: any) => app.util.isNewerReadState(a, b),
  };

  container.config = configAdapter;
  container.message = messageAdapter;
  container.bookmark = bookmarkAdapter;
  container.cache = cacheServiceAdapter;
  container.util = utilAdapter;
  container.readState = readStateAdapter;
  container.board = boardServiceAdapter;
  container.bbsMenu = bbsMenuServiceAdapter;
  container.notification = notificationServiceAdapter;
}
