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
  readcgiVer?: number;
  datSize?: number;
}

export interface ICacheService {
  getCache(path: string): ICacheItem;
}

export interface IReadState {
  url: string;
  last: number;
  read: number;
  received: number;
  offset?: number;
  date?: number;
}

export interface IReadStateService {
  get(url: string): Promise<IReadState | undefined>;
  getByBoard(boardUrl: string): Promise<IReadState[]>;
  set(readState: IReadState): Promise<void>;
}

export interface IBookmark {
  get(url: string): any;
  updateResCount(url: string, count: number): void;
  updateExpired(url: string, expired: boolean): void;
  getByBoard(boardUrl: string): any[];
}

export interface IMessage {
  send(type: string, data?: any): void;
  on(type: string, callback: (data: any) => void): void;
}

export interface IUtil {
  escapeHtml(str: string): string;
  safeHref(url: string): string;
  defer(): Promise<void>;
  isNewerReadState(a: any, b: any): boolean;
}

export interface IThread {
  url: string;
  title: string;
  resCount: number;
  createdAt: number;
  ng?: any;
  highlight?: any;
  isNet?: boolean | null;
  readState?: IReadState;
  threadNumber?: number;
}

export interface IBoardResult {
  threads: IThread[];
  message: string | null;
}

export interface IBoardService {
  getThreads(url: string): Promise<IBoardResult>;
}

export interface IServiceContainer {
  config: IConfig;
  cache: ICacheService;
  bookmark: IBookmark;
  message: IMessage;
  util: IUtil;
  readState: IReadStateService;
  board: IBoardService;
}
