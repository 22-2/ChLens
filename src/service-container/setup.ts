import { container } from "./Container";
import { IConfig, ICacheService, IBookmark, IMessage, ICacheItem } from "./interfaces";
// @ts-ignore
import Cache from "../core/Cache.js";

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

  container.config = configAdapter;
  container.message = messageAdapter;
  container.bookmark = bookmarkAdapter;
  container.cache = cacheServiceAdapter;
}
