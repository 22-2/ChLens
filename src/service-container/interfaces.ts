import { BBSMenu } from "src/core/BBSMenuParser";
export interface IConfig {
  get(key: string): any;
  set(key: string, value: any): Promise<void> | void;
  ready(callback: () => void): void;
  getAll?(): Record<string, string>;
  del?(key: string): Promise<void>;
}

export interface ICacheItem {
  get(): Promise<any>;
  // 既存実装では、事前に data/lastUpdated を設定済みなら put() を引数なしで呼べる。
  // 呼び出し側（Board/Thread/URL 等）との整合を保つため data は optional にする。
  put(
    data?: string,
    options?: { lastModified?: number; etag?: string },
  ): Promise<void>;
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
  off(type: string, callback: (data: any) => void): void;
}

export interface IUtil {
  escapeHtml(str: string): string;
  safeHref(url: string): string;
  defer(): Promise<void>;
  isNewerReadState(a: any, b: any): boolean;
  guessType(url: string): { bbsType: string; protocol: string };
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
  other?: string;
  be?: string;
  message: string;
  isNew?: boolean;
  ng?: INGResult;
  isAA?: boolean;
  class?: string[];
}

export interface IThreadModel {
  url: string;
  title: string;
  resData: Map<number, IRes>;
  idIndex: Map<string, Set<number>>;
  slipIndex: Map<string, Set<number>>;
  tripIndex: Map<string, Set<number>>;
  repIndex: Map<number, Set<number>>;
  repNgIndex: Map<number, Set<number>>;
  ancIndex: Map<number, Set<number>>;
  harmImgIndex: Set<number>;
  oneId: string | null;
  over1000ResNum: number | null;

  addRes(res: IRes): void;
  getRes(num: number): IRes | undefined;
  refreshNG(): void;
  getRead(
    scrollTop: number,
    clientHeight: number,
    getOffsetTop: (num: number) => number,
    getOffsetHeight: (num: number) => number,
  ): number;
}

export interface IThreadDetail {
  url: string;
  title: string;
  res: IRes[];
  message?: string;
  expired?: boolean;
}

export interface IThreadService {
  getThread(
    url: string,
    options?: {
      forceUpdate?: boolean;
      onCache?: (thread: IThreadDetail) => void;
    },
  ): Promise<IThreadDetail>;
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
  menu: BBSMenu[];
  status: "success" | "error";
  message?: string;
}

export interface IBBSMenuService {
  get(forceReload?: boolean): Promise<IBBSMenuResult>;
}

export interface IToastService {
  notify(
    message: string,
    options?: { html?: boolean; backgroundColor?: string },
  ): void;
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
}

export interface INotificationService {
  notify(
    title: string,
    options?: { message?: string; url?: string; tag?: string },
  ): Promise<boolean>;
  isSupported(): boolean;
}

export interface INGResult {
  type: string;
  name?: string;
  params?: any;
}

export interface INGService {
  isNGBoard(title: string, url: string, resCount: number): INGResult | null;
  isNGThread(res: any, title: string, url: string): INGResult | null;
  isThreadIgnoreNgType(
    res: any,
    threadTitle: string,
    url: string,
    ngType: string,
  ): INGResult | null;
  add(ngWord: string): Promise<void> | void;
  invalidateCache(): void;
  execExpire(): void;
  isIgnoreResNumForAuto(resNum: number, subType: string): boolean;
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
  toast: IToastService;
  notification: INotificationService;
  thread: IThreadService;
  ng: INGService;
}
