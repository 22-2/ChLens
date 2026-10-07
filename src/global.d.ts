// ファイルをモジュール化して declare global を有効にする
export {};

declare global {
  interface Window {
    app: typeof app;
    container: import("./service-container/interfaces").IServiceContainer;
  }

  namespace app {
    function boot(
      path: string,
      requirements: ((...modules: unknown[]) => void) | string[] | null,
      callback?: (...modules: unknown[]) => void,
    ): Promise<void>;
    // src/app.ts で appObj に代入される app/Util 由来のヘルパー群
    const replaceAll: (str: string, before: string, after: string) => string;
    const escapeHtml: (str: string) => string;
    const safeHref: (url: string) => string;
    const config: import("./app/Config").default;
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
    // delなど実装が公開するstatic APIと同期し、存在しないremoveを宣言しない。
    const LocalStorage: typeof import("./app/LocalStorage").default;
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

    const bookmark: import("./core/Bookmark").default;
    const bookmarkEntryList: import("./core/Bookmark").default["bel"];
    const History: typeof import("./core/History");
    const ReadState: typeof import("./core/ReadState");
    const WriteHistory: typeof import("./core/WriteHistory");
    const _config: import("./app/Config").default;
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

// vite が処理する CSS の side-effect import 用のモジュール宣言。
declare module "*.css";

declare module "normalize-wheel" {
  interface NormalizedWheelEvent {
    spinX: number;
    spinY: number;
    pixelX: number;
    pixelY: number;
  }

  export default function normalizeWheel(event: WheelEvent | MouseEvent): NormalizedWheelEvent;
}
