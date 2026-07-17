import { container } from "src/service-container/Container";
import {
  IBBSMenuResult,
  IBBSMenuService,
  IBoardResult,
  IBoardService,
  IBookmark,
  IBookmarkItem,
  ICacheItem,
  ICacheService,
  IConfig,
  IMessage,
  INGResult,
  INGService,
  INotificationService,
  IReadState,
  IReadStateService,
  IThreadService,
  IToastService,
  IUtil,
} from "src/service-container/interfaces";
import { LogLevels } from "consola";
import BoardService from "src/core/BoardService.js";
import Cache from "src/core/Cache.js";
import * as BBSMenu from "src/core/BBSMenu.js";
import { setConsolaLevel } from "src/core/logger";
import { toast } from "sonner";
import Notification from "src/core/Notification";
import ThreadService from "src/core/ThreadService.js";

// レガシー window.app の型。IServiceContainer への完全移行後に削除予定。
interface LegacyAppForSetup {
  config: {
    get(key: string): string | null;
    set(key: string, val: unknown): Promise<void>;
    ready(cb: () => void): void;
    getAll(): Record<string, string>;
    del(key: string): Promise<void>;
  };
  message: {
    send(type: string, data?: unknown): void;
    // global.d.ts の app.message と同様、コールバック側の型を推論させる。
    on<T = unknown>(type: string, cb: (data: T) => void): void;
    off<T = unknown>(type: string, cb: (data: T) => void): void;
  };
  NG?: {
    // INGService の戻り値型と揃える。unknown のままだとアダプタ側で代入エラーになる。
    isNGBoard(title: string, url: string, resCount: number): INGResult | null;
    isNGThread(res: unknown, title: string, url: string): INGResult | null;
    isThreadIgnoreNgType(
      res: unknown,
      threadTitle: string,
      url: string,
      ngType: string,
    ): INGResult | null;
    add(ngWord: string): Promise<void>;
    invalidateCache(): void;
    execExpire(): void;
    isIgnoreResNumForAuto(num: number, type: string): boolean;
    set(val: unknown): Promise<void>;
  };
  bookmark?: {
    // IBookmark アダプタの戻り値型と揃える (unknown だと代入エラーになるため)。
    get(url: string): IBookmarkItem | undefined;
    add?(url: string, title: string, resCount?: number): Promise<boolean>;
    remove(url: string): Promise<boolean>;
    updateResCount(url: string, count: number): Promise<boolean>;
    updateExpired(url: string, exp: boolean): Promise<boolean>;
    getByBoard(url: string): IBookmarkItem[];
  };
  ReadState?: {
    // IReadStateService の型と揃える。
    get(url: string): Promise<IReadState | undefined>;
    getByBoard(boardUrl: string): Promise<IReadState[]>;
    set(readState: IReadState): Promise<void>;
  };
  escapeHtml(str: string): string;
  safeHref(url: string): string;
  defer(): Promise<void>;
  util?: {
    isNewerReadState(a: unknown, b: unknown): boolean;
    guessType?(url: string): { bbsType: string; protocol: string };
  };
}

export function setupContainer(app: LegacyAppForSetup) {
  const syncConsolaLevel = () => {
    setConsolaLevel(
      app.config.get("debug_log") === "on" ? LogLevels.debug : LogLevels.info,
    );
  };

  syncConsolaLevel();

  // Config Adapter
  const configAdapter: IConfig = {
    get: (key: string) => app.config.get(key),
    set: async (key: string, val: unknown) => {
      // 変更理由: 設定保存は非同期ストレージへ書き込むため、ここで Promise を落とすと
      // 「見た目は更新されたのにリロード直後に戻る」競合を呼び込みやすい。
      await app.config.set(key, val);
      // NGワード設定が更新されたら、NGサービス側の内部状態とキャッシュも同期する。
      // これにより、設定画面での保存が即座にNG判定ロジックへ反映されるようになる。
      if (key === "ngwords" && app.NG?.set) {
        await app.NG.set(val);
      }
      if (key === "debug_log") {
        syncConsolaLevel();
      }
    },
    ready: (cb: () => void) => app.config.ready(cb),
    getAll: () => app.config.getAll(),
    del: (key: string) => app.config.del(key),
  };

  app.message.on("config_updated", ({ key }: { key?: string }) => {
    if (key === "debug_log") {
      syncConsolaLevel();
    }
  });

  // Message Adapter
  // on/off はジェネリックメソッドのため、アロー関数プロパティではなく
  // メソッド構文で実装して bivariance を効かせる。
  const messageAdapter: IMessage = {
    send: (type: string, data?: unknown) => app.message.send(type, data),
    on(type, cb) {
      app.message.on(type, cb);
    },
    off(type, cb) {
      app.message.off(type, cb);
    },
  };

  // Bookmark Adapter
  const bookmarkAdapter: IBookmark = {
    get: (url: string) => app.bookmark?.get(url),
    // container側では `IBookmarkItem` を受け取るため、
    // core の `app.bookmark.add(url, title, resCount?)` へ適切に展開して渡す。
    add: (item: IBookmarkItem) =>
      app.bookmark?.add?.(item.url, item.title, item.resCount),
    remove: (url: string) => app.bookmark?.remove(url),
    updateResCount: (url: string, count: number) =>
      app.bookmark?.updateResCount(url, count),
    updateExpired: (url: string, exp: boolean) =>
      app.bookmark?.updateExpired(url, exp),
    // レガシー app.bookmark が未初期化のときは「ブックマークなし」として扱う。
    getByBoard: (url: string) => app.bookmark?.getByBoard(url) ?? [],
  };

  // Cache Adapter
  const cacheServiceAdapter: ICacheService = {
    getCache: (path: string): ICacheItem => {
      return new Cache(path) as ICacheItem;
    },
  };

  // ReadState Adapter
  // レガシー app.ReadState が未初期化でも Promise を返す契約を守るため async にする。
  const readStateAdapter: IReadStateService = {
    get: async (url: string) => app.ReadState?.get(url),
    getByBoard: async (boardUrl: string) =>
      (await app.ReadState?.getByBoard(boardUrl)) ?? [],
    set: async (readState: IReadState) => {
      await app.ReadState?.set(readState);
    },
  };

  // Board Service Adapter
  const boardServiceAdapter: IBoardService = {
    getThreads: (url: string): Promise<IBoardResult> =>
      BoardService.getThreads(url),
    getCachedResCount: (url: string) => BoardService.getCachedResCount(url),
  };

  // BBSMenu Service Adapter
  const bbsMenuServiceAdapter: IBBSMenuService = {
    get: (forceReload?: boolean) =>
      BBSMenu.get(forceReload) as Promise<IBBSMenuResult>,
  };

  // Thread Service Adapter
  const threadServiceAdapter: IThreadService = {
    getThread: (url, options) => ThreadService.getThread(url, options),
  };

  // Toast Service Adapter
  const toastServiceAdapter: IToastService = {
    notify: (message, options) => {
      if (options?.backgroundColor) {
        toast(message, {
          style: { backgroundColor: options.backgroundColor },
        });
      } else {
        toast(message);
      }
    },
    success: (message) => {
      toast.success(message);
    },
    error: (message) => {
      toast.error(message);
    },
    info: (message) => {
      toast.info(message);
    },
  };

  // Notification Service Adapter
  const notificationServiceAdapter: INotificationService = {
    notify: async (title, options) => {
      // container.notification は OS 通知専用に分離し、
      // UI向けメッセージは container.toast 側で扱う。
      const instance = new Notification(
        title,
        options?.message ?? "",
        options?.url ?? "",
        options?.tag,
      );
      return instance.ready;
    },
    isSupported: () => Notification.isSupported(),
  };

  // NG Service Adapter
  // レガシー app.NG が未初期化のときは「NG該当なし」として扱う (?? null / ?? false)。
  const ngServiceAdapter: INGService = {
    isNGBoard: (title, url, resCount) =>
      app.NG?.isNGBoard(title, url, resCount) ?? null,
    isNGThread: (res, title, url) =>
      app.NG?.isNGThread(res, title, url) ?? null,
    isThreadIgnoreNgType: (res, threadTitle, url, ngType) =>
      app.NG?.isThreadIgnoreNgType(res, threadTitle, url, ngType) ?? null,
    add: (ngWord) => app.NG?.add(ngWord),
    invalidateCache: () => app.NG?.invalidateCache(),
    execExpire: () => app.NG?.execExpire(),
    isIgnoreResNumForAuto: (num, type) =>
      app.NG?.isIgnoreResNumForAuto(num, type) ?? false,
  };

  // Util Adapter
  const utilAdapter: IUtil = {
    escapeHtml: (str: string) => app.escapeHtml(str),
    safeHref: (url: string) => app.safeHref(url),
    defer: () => app.defer(),
    // app.util 未初期化時は「より新しいとは判定しない」= false を返す。
    isNewerReadState: (a: unknown, b: unknown) =>
      app.util?.isNewerReadState(a, b) ?? false,
    guessType: (url: string) =>
      app.util?.guessType
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
  container.toast = toastServiceAdapter;
  container.notification = notificationServiceAdapter;
  container.ng = ngServiceAdapter;
}
