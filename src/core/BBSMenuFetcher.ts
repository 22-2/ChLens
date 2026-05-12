import { BBSMenu, BBSMenuParser } from "src/core/BBSMenuParser";
import { Request } from "src/core/HTTP";
import { ICacheItem } from "src/service-container/interfaces";
import { createLogger } from "src/core/logger";

const logger = createLogger("BBSMenuFetcher");

export interface IFetcherDeps {
  getCache(url: string): ICacheItem;
  getExcludeTslds(): Set<string>;
}

// -------------------------------
// 内部ユーティリティ
// -------------------------------

/**
 * Last-Modified ヘッダ文字列をタイムスタンプに変換する。
 * 不正な値の場合は undefined を返す。
 */
function parseLastModified(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

// レスポンス型（Request.send() の戻り値に合わせて調整すること）
type HttpResponse = Awaited<ReturnType<InstanceType<typeof Request>["send"]>>;

// -------------------------------
// BBSMenuFetcher
// -------------------------------

/**
 * 単一URLからBBSMenuを取得する責務を担うクラス。
 * キャッシュ判定・HTTPリクエスト・キャッシュ更新を行う。
 */
export class BBSMenuFetcher {
  constructor(private readonly deps: IFetcherDeps) {}

  /**
   * 指定URLからBBSMenuを取得する。
   *
    * - キャッシュが存在し、force=false → キャッシュから返す
    * - キャッシュ未存在 / force=true  → HTTP通信し結果を返す
   *   - 304 の場合は lastUpdated だけ更新してキャッシュデータを返す
   */
  async fetch(url: string, force = false): Promise<BBSMenu> {
    const cache = this.deps.getCache(url);

    logger.debug(`Cache を確認します: ${url}`, { cache });

    const cacheLoaded = await this.tryLoadCache(cache);
    // Why: bbsmenu_update_interval 設定を廃止し、期限切れ判定では再取得しない。
    // 明示的な force 更新時のみHTTPへ行くことで挙動を単純化する。
    const shouldFetch = !cacheLoaded || force;

    logger.debug(`Fetching BBSMenu from ${url}`, {
      force,
      cacheLoaded,
      shouldFetch,
      cacheLastUpdated: cache.lastUpdated,
    });

    const response = shouldFetch
      ? await this.sendRequest(url, cacheLoaded ? cache : undefined)
      : undefined;

    return this.resolveMenu(url, cache, response);
  }

  // -------------------------------
  // Private helpers
  // -------------------------------

  /** キャッシュのロードを試みる。失敗またはデータが空の場合は false を返す。 */
  private async tryLoadCache(cache: ICacheItem): Promise<boolean> {
    try {
      await cache.get();
      const loaded = cache.data != null;
      // get() が例外なく完了しても data が未設定の場合はキャッシュなしと扱う
      if (!loaded) {
        logger.debug("キャッシュは存在するが data が null");
      }
      return loaded;
    } catch (e) {
      logger.debug("キャッシュ読み込み失敗", { error: String(e) });
      return false;
    }
  }

  /**
   * 条件付き GET リクエストを送信する。
   * キャッシュが存在する場合は If-Modified-Since / If-None-Match を付与する。
   */
  private async sendRequest(
    url: string,
    cache: ICacheItem | undefined,
  ): Promise<HttpResponse> {
    const request = new Request("GET", url, {
      mimeType: "text/plain; charset=Shift_JIS",
    });

    if (cache?.lastModified != null) {
      request.headers["If-Modified-Since"] = new Date(
        cache.lastModified,
      ).toUTCString();
    }
    if (cache?.etag != null) {
      request.headers["If-None-Match"] = cache.etag;
    }

    logger.debug("HTTP通信します", { url });
    return request.send();
  }

  /**
   * レスポンス（または undefined）とキャッシュからメニューを解決する。
   * - 200 → 新鮮なデータを保存して返す
   * - 304 / 通信なし → キャッシュデータを返す（304 は lastUpdated を更新）
   * - キャッシュなし・通信失敗 → エラーをスロー
   */
  private async resolveMenu(
    url: string,
    cache: ICacheItem,
    response: HttpResponse | undefined,
  ): Promise<BBSMenu> {
    const excludeTslds = this.deps.getExcludeTslds();

    if (response?.status === 200) {
      const menu = BBSMenuParser.parse(response.body, url, excludeTslds);

      await cache.put(response.body, {
        lastModified: parseLastModified(response.headers["Last-Modified"]),
        etag: response.headers["ETag"],
      });

      return menu;
    }

    if (cache.data != null) {
      if (response?.status === 304) {
        logger.debug("304 Not Modified: キャッシュを更新します");
        await cache.put(cache.data);
      }
      return BBSMenuParser.parse(cache.data, url, excludeTslds);
    }

    throw new Error("板一覧の取得に失敗しました");
  }
}
