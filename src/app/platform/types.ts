export interface WindowOptions {
  url: string;
  width?: number;
  height?: number;
  focused?: boolean;
}

export interface WindowManager {
  /**
   * プラットフォーム内で管理される静的アセットへのURLを解決する
   */
  getAssetUrl(path: string): string;

  /**
   * 新しいタブでURLを開く
   */
  openTab(url: string, active?: boolean): Promise<void>;

  /**
   * 新しいウィンドウでURLを開く
   */
  openWindow(options: WindowOptions): Promise<void>;

  /**
   * 現在のウィンドウ/タブを閉じる
   */
  closeCurrent(): Promise<void>;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  url: string;
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  mimeType?: string;
}

export interface HttpClient {
  fetch(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  /**
   * 書き込みリクエスト（POST）の前に、RefererやOriginヘッダーを制御するための
   * プラットフォーム固有の設定を行います（拡張機能の declarativeNetRequest 等）。
   */
  setupWriteHeaders(url: string): Promise<void>;
}

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  getAll(): Promise<Record<string, string>>;
  onChanged(
    callback: (
      changes: Record<
        string,
        { oldValue: string | null; newValue: string | null }
      >,
    ) => void,
  ): void;
}

export interface ObjectStore {
  get(key: string): Promise<any>;
  put(value: any): Promise<void>;
  delete(key: string): Promise<void>;
  getAll(): Promise<any[]>;
  clear(): Promise<void>;
  count(): Promise<number>;
  /**
   * インデックスによる検索 (IndexedDB互換)
   */
  index(name: string): {
    getAll(query?: any): Promise<any[]>;
    getAllKeys(query?: any): Promise<any[]>;
  };
}

export interface StorageManager {
  /**
   * 設定保存などのシンプルなキーバリューストア (LocalStorage相当)
   */
  kv: KeyValueStore;

  /**
   * 構造化データ保存用のオブジェクトストア (IndexedDB相当)
   * 引数によって異なるストア（名前空間）を返せるようにする
   */
  getStore(name: string): ObjectStore;
}

export interface Platform {
  window: WindowManager;
  http: HttpClient;
  storage: StorageManager;
}
