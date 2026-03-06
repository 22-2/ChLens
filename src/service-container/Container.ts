import { IServiceContainer, IConfig, ICacheService, IBookmark, IMessage, IUtil } from "./interfaces";

const globalObj = window as any;

if (!globalObj.__ServiceContainer) {
  globalObj.__ServiceContainer = {
    _config: undefined,
    _cache: undefined,
    _bookmark: undefined,
    _message: undefined,
    _util: undefined,
    
    get config(): IConfig {
      if (!this._config) throw new Error("Config service not registered");
      return this._config;
    },
    set config(value: IConfig) { this._config = value; },

    get cache(): ICacheService {
      if (!this._cache) throw new Error("Cache service not registered");
      return this._cache;
    },
    set cache(value: ICacheService) { this._cache = value; },

    get bookmark(): IBookmark {
      if (!this._bookmark) throw new Error("Bookmark service not registered");
      return this._bookmark;
    },
    set bookmark(value: IBookmark) { this._bookmark = value; },

    get message(): IMessage {
      if (!this._message) throw new Error("Message service not registered");
      return this._message;
    },
    set message(value: IMessage) { this._message = value; },

    get util(): IUtil {
      if (!this._util) throw new Error("Util service not registered");
      return this._util;
    },
    set util(value: IUtil) { this._util = value; }
  };
}

export const container: IServiceContainer = globalObj.__ServiceContainer;
