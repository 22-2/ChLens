// ファイルをモジュール化して declare global を有効にする
export {};

declare global {
  interface Window {
    app: typeof app;
    container: import("./service-container/interfaces").IServiceContainer;
  }

  // ShortQuery.js (CoffeeScript製レガシーライブラリ) が定義するグローバルヘルパー。
  // $__ は document.createElement のショートハンド。
  function $__<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K];
  function $__(tagName: string): HTMLElement;

  // ShortQuery.js は Document/Element の prototype にもショートハンドを生やす。
  // ここでは型チェック対象のコードで実際に使われているものだけを宣言する。
  interface Document {
    /** getElementsByTagName のショートハンド */
    T(tagName: string): HTMLCollectionOf<Element>;
  }
  interface Element {
    /** getElementsByTagName のショートハンド */
    T(tagName: string): HTMLCollectionOf<Element>;
  }

  namespace app {
    // src/app.ts で appObj に代入される app/Util 由来のヘルパー群
    const replaceAll: (str: string, before: string, after: string) => string;
    const escapeHtml: (str: string) => string;
    const safeHref: (url: string) => string;
    const config: {
      get(key: string): string | null;
      set(key: string, val: string): Promise<void>;
      ready: (...args: unknown[]) => unknown;
      getAll(): Record<string, string>;
      del(key: string): Promise<void>;
      isOn(key: string): boolean;
    };
    // 実装 (src/app/Callbacks.ts) と同じくジェネリックで宣言し、
    // 購読側が狭い型のコールバックを add できるようにする。
    const Callbacks: {
      new <Args extends unknown[] = unknown[]>(config?: {
        persistent?: boolean;
      }): {
        add(callback: (...args: Args) => unknown): void;
        remove(callback: (...args: Args) => unknown): void;
        call(...args: Args): void;
        wasCalled: boolean;
        destroy(): void;
      };
    };
    const log: (...args: unknown[]) => void;
    const LocalStorage: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<void>;
      remove(key: string): Promise<void>;
      getAll(): Promise<Record<string, string>>;
      onChanged(
        cb: (changes: Record<string, { oldValue: string | null; newValue: string | null }>) => void,
      ): void;
    };
    const deepCopy: <T>(obj: T) => T;
    const message: {
      send(type: string, data?: unknown): void;
      // 購読側が狭い型のコールバックを渡せるよう、ジェネリクスで型を推論させる
      // (unknown 固定だとコールバック引数の分割代入が全て型エラーになるため)。
      on<T = unknown>(type: string, cb: (data: T) => void): void;
      off<T = unknown>(type: string, cb: (data: T) => void): void;
    };
    const defer: () => Promise<void>;
    const platform: import("./app/platform/types").Platform;

    const bookmark: {
      get(url: string): import("./core/BookmarkEntryList").Entry | null;
      getByBoard(boardURL: string): import("./core/BookmarkEntryList").Entry[];
      getAll(): import("./core/BookmarkEntryList").Entry[];
      getAllThreads(): import("./core/BookmarkEntryList").Entry[];
      getAllBoards(): import("./core/BookmarkEntryList").Entry[];
      add(url: string, title: string, resCount?: number): Promise<boolean>;
      remove(url: string): Promise<boolean>;
      updateReadState(readState: Record<string, unknown>): Promise<boolean>;
      updateResCount(url: string, resCount: number): Promise<boolean>;
      updateExpired(url: string, expired: boolean): Promise<boolean>;
      readonly bel: {
        ready: { add(cb: () => void): void; wasCalled: boolean; call(): void };
      };
      readonly promiseFirstScan: Promise<boolean>;
    };
    const HTTP: {
      getWithAbort(
        url: string,
        options?: { mimeType?: string; timeout?: number },
      ): {
        response: Promise<{
          readAsText(charset: string): Promise<string>;
          getResponseHeader(name: string): string | undefined;
          status: number;
          finalUrl?: string;
          headers?: Record<string, string>;
        }>;
        abort(): void;
      };
      get(
        url: string,
        options?: { mimeType?: string; timeout?: number },
      ): Promise<{
        readAsText(charset: string): Promise<string>;
        getResponseHeader(name: string): string | undefined;
        status: number;
        finalUrl?: string;
        headers?: Record<string, string>;
      }>;
    };
    const util: {
      isNewerReadState(a: unknown, b: unknown): boolean;
      guessType(url: string): { bbsType: string; protocol: string };
    };
  }

  namespace browser.bookmarks {
    const onImportBegan: EvListener<() => void>;
    const onImportEnded: EvListener<() => void>;
  }

  // https://github.com/Microsoft/TypeScript/issues/13086
  interface Map<K, V> {
    has<CheckedString extends string>(
      this: Map<string, V>,
      key: CheckedString,
    ): this is MapWith<K, V, CheckedString>;
  }
  interface MapWith<K, V, DefiniteKey extends K> extends Map<K, V> {
    get(k: DefiniteKey): V;
    get(k: K): V | undefined;
  }
  interface ReadonlyMap<K, V> {
    has<CheckedString extends string>(
      this: ReadonlyMap<string, V>,
      key: CheckedString,
    ): this is ReadonlyMapWith<K, V, CheckedString>;
  }
  interface ReadonlyMapWith<K, V, DefiniteKey extends K> extends ReadonlyMap<K, V> {
    get(k: DefiniteKey): V;
    get(k: K): V | undefined;
  }
}

// vite が処理する CSS/SCSS の side-effect import 用のモジュール宣言。
declare module "*.css";
declare module "*.scss";

declare module "normalize-wheel" {
  interface NormalizedWheelEvent {
    spinX: number;
    spinY: number;
    pixelX: number;
    pixelY: number;
  }

  export default function normalizeWheel(event: WheelEvent | MouseEvent): NormalizedWheelEvent;
}
