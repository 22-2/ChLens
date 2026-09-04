import type { Rule } from "@chlen/ch-lib";
import { BBSMenu } from "src/core/BBSMenuParser";
export interface IConfig {
  // 設定ストアは文字列ベース (app.config.get は string | null を返す)。
  // unknown だと利用側で JSON.parse 等に渡せず型エラーになるため実態に合わせる。
  get(key: string): string | null;
  set(key: string, value: unknown): Promise<void> | void;
  ready(callback: () => void): void;
  getAll(): Record<string, string>;
  del?(key: string): Promise<void>;
}

export interface ICacheItem {
  get(): Promise<unknown>;
  // 既存実装では、事前に data/lastUpdated を設定済みなら put() を引数なしで呼べる。
  // 呼び出し側（Board/Thread/URL 等）との整合を保つため data は optional にする。
  put(data?: string, options?: { lastModified?: number; etag?: string }): Promise<void>;
  // Cache 実装 (src/core/Cache.ts) は文字列データを保持する。unknown だと
  // put() や parse 系に渡せず型エラーになるため実態に合わせる。
  data: string | null;
  lastUpdated: number;
  lastModified?: number;
  etag?: string;
  resLength?: number;
  parsed?: unknown;
  readcgiVer?: number;
  datSize?: number;
  // 閲覧ログ用メタ情報
  title?: string | null;
  threadUrl?: string | null;
  boardUrl?: string | null;
  boardTitle?: string | null;
  kind?: string | null;
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
  send(type: string, data?: unknown): void;
  // 購読側は `({ key }: { key?: string }) => void` のような狭い型のコールバックを渡すため、
  // 引数を `unknown` 固定にすると全呼び出し箇所で型エラーになる。
  // メソッド構文の bivariance を利用し、ジェネリクスでコールバック側の型を推論させる。
  on<T = unknown>(type: string, callback: (data: T) => void): void;
  off<T = unknown>(type: string, callback: (data: T) => void): void;
}

export interface IUtil {
  escapeHtml(str: string): string;
  safeHref(url: string): string;
  defer(): Promise<void>;
  isNewerReadState(a: unknown, b: unknown): boolean;
  guessType(url: string): { bbsType: string; protocol: string };
}

export interface IThread {
  url: string;
  title: string;
  resCount: number;
  createdAt: number;
  ng?: INGResult | null;
  demoted?: INGResult | null;
  highlight?: INGResult | null;
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
  missingFromSubject?: boolean;
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
  getThreads(url: string): Promise<IBoardResult>;
  getCachedResCount(url: string): Promise<unknown>;
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
  notify(message: string, options?: { html?: boolean; backgroundColor?: string }): void;
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
  action?: "hide" | "blur" | "highlight" | "demote" | "warn";
  /** 実際に一致した条件だけを抜き出したDSL。NG理由の表示に使用する。 */
  ruleDescription?: string;
  /** 設定内のルール位置。表示側で同じルールの一致結果をまとめるために使用する。 */
  ruleIndex?: number;
  name?: string;
  params?: Record<string, string>;
  /** NG ルールが一時的に無効化されているかどうか */
  disabled?: boolean;
}

export interface INGService {
  isNGBoard(title: string, url: string, resCount: number): INGResult | null;
  isNGThread(res: unknown, title: string, url: string): INGResult | null;
  /** 汎用のレス判定から分離した、画像ぼかし専用ルールを取得する。 */
  getSimilarImageRules?: () => readonly Rule[];
  add(ruleDsl: string): Promise<void> | void;
  invalidateCache(): void;
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
  toast: IToastService;
  notification: INotificationService;
  thread: IThreadService;
  ng: INGService;
}
