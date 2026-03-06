export interface IConfig {
  get(key: string): any;
  set(key: string, value: any): void;
  ready(callback: () => void): void;
}

export interface ICacheItem {
  get(): Promise<any>;
  put(data: any, options?: { lastModified?: number; etag?: string }): Promise<void>;
  data: any;
  lastUpdated: number;
  lastModified?: number;
  etag?: string;
  resLength?: number;
  parsed?: any;
}

export interface ICacheService {
  getCache(path: string): ICacheItem;
}

export interface IBookmark {
  updateResCount(url: string, count: number): void;
  updateExpired(url: string, expired: boolean): void;
  getByBoard(boardUrl: string): any[];
}

export interface IMessage {
  send(type: string, data?: any): void;
  on(type: string, callback: (data: any) => void): void;
}

export interface IServiceContainer {
  config: IConfig;
  cache: ICacheService;
  bookmark: IBookmark;
  message: IMessage;
  // 他、NG判定なども追加可能
}
