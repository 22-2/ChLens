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

export interface IBookmarkItem {
  url: string;
  title: string;
  type: "thread" | "board";
  resCount?: number;
  readState?: IReadState;
  expired?: boolean;
}

export interface IBookmark {
  get(url: string): IBookmarkItem | undefined;
  add(item: IBookmarkItem): void;
  remove(url: string): void;
  updateResCount(url: string, count: number): void;
  updateExpired(url: string, expired: boolean): void;
  getByBoard(boardUrl: string): IBookmarkItem[];
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

export interface IRes {
  num: number;
  name: string;
  mail: string;
  date: string;
  id?: string;
  slip?: string;
  trip?: string;
  be?: string;
  message: string;
  isNew?: boolean;
  ng?: INGResult;
}

export interface IThreadDetail {
  url: string;
  title: string;
  res: IRes[];
  message?: string;
  expired?: boolean;
}

export interface IThreadService {
  getThread(url: string, options?: { forceUpdate?: boolean, onCache?: (thread: IThreadDetail) => void }): Promise<IThreadDetail>;
}

export interface IBoardResult {
  threads: IThread[];
  message: string | null;
}

export interface IBoardService {
  getThreads(url: any): Promise<IBoardResult>;
  getCachedResCount(url: any): Promise<any>;
}

export interface IBBSMenuBoard {
  url: string;
  title: string;
}

export interface IBBSMenuCategory {
  title: string;
  board: IBBSMenuBoard[];
}

export interface IBBSMenuResult {
  menu: IBBSMenuCategory[];
  status: "success" | "error";
  message?: string;
}

export interface IBBSMenuService {
  get(forceReload?: boolean): Promise<IBBSMenuResult>;
}

export interface INotificationService {
  notify(message: string, options?: { html?: boolean; backgroundColor?: string }): void;
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
}

export interface INGResult {
  type: string;
  name?: string;
  params?: any;
}

export interface INGService {
  isNGBoard(title: string, url: string, resCount: number): INGResult | null;
  isNGThread(res: any, title: string, url: string): INGResult | null;
  isThreadIgnoreNgType(res: any, threadTitle: string, url: string, ngType: string): INGResult | null;
  add(ngWord: string): void;
  execExpire(): void;
}

export interface IServiceContainer {
  config: IConfig;
  cache: ICacheService;
  bookmark: IBookmark;
  message: IMessage;
  util: IUtil;
  readState: IReadStateService;
  board: IBoardService;
  bbsMenu: IBBSMenuService;
  notification: INotificationService;
  thread: IThreadService;
  ng: INGService;
}
