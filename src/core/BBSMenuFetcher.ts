import { BBSMenu, BBSMenuParser } from "src/core/BBSMenuParser";
import { Request } from "src/core/HTTP";
import { ICacheItem } from "src/service-container/interfaces";

/**
 * キャッシュとHTTP通信を抽象化するインターフェース。
 * テスト時にモックに差し替えられる。
 */
export interface IFetcherDeps {
  getCache(url: string): ICacheItem;
  getUpdateIntervalDays(): number;
  getExcludeTslds(): Set<string>;
}

/**
 * 単一URLからBBSMenuを取得する責務を担うクラス。
 * キャッシュ判定・HTTPリクエスト・キャッシュ更新を行う。
 * 依存はコンストラクタ注入で受け取るためテスト可能。
 */
export class BBSMenuFetcher {
  constructor(private readonly deps: IFetcherDeps) {}

  /**
   * 指定URLからBBSMenuを取得する。
   * キャッシュが有効な場合はキャッシュを使用し、期限切れまたは強制更新時はHTTP通信を行う。
   *
   * @param url         取得先URL
   * @param force       trueの場合はキャッシュを無視して強制取得
   */
  async fetch(url: string, force = false): Promise<BBSMenu> {
    const cache = this.deps.getCache(url);
    let response: any;

    try {
      await cache.get();
      if (force) {
        throw new Error("最新のものを取得するために通信します");
      }
      const intervalMs =
        this.deps.getUpdateIntervalDays() * 1000 * 60 * 60 * 24;
      if (Date.now() - cache.lastUpdated > intervalMs) {
        throw new Error("キャッシュが期限切れなので通信します");
      }
    } catch {
      // キャッシュが無効 → HTTP通信
      const request = new Request("GET", url, {
        mimeType: "text/plain; charset=Shift_JIS",
      });
      if (cache.lastModified != null) {
        request.headers["If-Modified-Since"] = new Date(
          cache.lastModified,
        ).toUTCString();
      }
      if (cache.etag != null) {
        request.headers["If-None-Match"] = cache.etag;
      }
      response = await request.send();
    }

    const excludeTslds = this.deps.getExcludeTslds();

    if (response?.status === 200) {
      const menu = BBSMenuParser.parse(response.body, url, excludeTslds);

      cache.data = response.body;
      cache.lastUpdated = Date.now();

      const lastModified = new Date(
        response.headers["Last-Modified"] || "dummy",
      ).getTime();

      await cache.put(response.body, {
        lastModified: Number.isFinite(lastModified) ? lastModified : undefined,
        etag: response.headers["ETag"],
      });

      return menu;
    } else if (cache.data != null) {
      const menu = BBSMenuParser.parse(cache.data, url, excludeTslds);

      if (response?.status === 304) {
        cache.lastUpdated = Date.now();
        await cache.put(cache.data);
      }

      return menu;
    } else {
      throw new Error("板一覧の取得に失敗しました");
    }
  }
}
