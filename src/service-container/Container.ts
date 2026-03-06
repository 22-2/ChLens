import { IServiceContainer, IConfig, ICacheService, IBookmark, IMessage } from "./interfaces";

class ServiceContainer implements IServiceContainer {
  private _config?: IConfig;
  private _cache?: ICacheService;
  private _bookmark?: IBookmark;
  private _message?: IMessage;

  get config(): IConfig {
    if (!this._config) throw new Error("Config service not registered");
    return this._config;
  }
  set config(value: IConfig) { this._config = value; }

  get cache(): ICacheService {
    if (!this._cache) throw new Error("Cache service not registered");
    return this._cache;
  }
  set cache(value: ICacheService) { this._cache = value; }

  get bookmark(): IBookmark {
    if (!this._bookmark) throw new Error("Bookmark service not registered");
    return this._bookmark;
  }
  set bookmark(value: IBookmark) { this._bookmark = value; }

  get message(): IMessage {
    if (!this._message) throw new Error("Message service not registered");
    return this._message;
  }
  set message(value: IMessage) { this._message = value; }
}

export const container = new ServiceContainer();
