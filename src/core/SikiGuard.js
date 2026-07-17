import Cache from "src/core/Cache.js";
import { Request } from "src/core/HTTP.ts";
import { URL } from "src/core/URL.ts";

/**
@class SikiGuard
@constructor
@param {String} url
*/
export default class SikiGuard {
  /** @param {string} url */
  constructor(url) {
    // 旧 JSDoc の @type String は実際の代入型 (URL) と食い違っていたため削除し、
    // 代入からの型推論に任せる。
    this.url = new URL(url);

    /** @type {Map<string, Set<string>>} */
    this.idMap = new Map();

    /** @type {string | null} */
    this.message = null;
  }

  /**
  @method get
  @return {Promise<void>}
  */
  get() {
    return new Promise(async (resolve, reject) => {
      let response, idMap;
      let hasCache = false;

      const xhrInfo = SikiGuard._getXhrInfo(this.url);
      if (xhrInfo == null) {
        this.idMap = new Map();
        resolve();
        return;
      }

      // キャッシュ取得
      const url = `https://sikiguard.net/${xhrInfo.tsld}/${xhrInfo.board}/id.json`;
      const cache = new Cache(url);

      let needFetch = false;
      try {
        await cache.get();
        hasCache = true;
        // NOTE: キャッシュを暫定30分にしてるけど、CDNにCloudflare使ってるっぽいので都度取得にして、取得できない時だけキャッシュ使うでもいいかも。
        // lastUpdated が null のときは従来 NaN 比較で「期限切れ」扱いになっていたので、明示的に同じ挙動にする。
        if (
          cache.lastUpdated == null ||
          !(Date.now() - cache.lastUpdated < 1000 * 60 * 30)
        ) {
          throw new Error("キャッシュの期限が切れているため通信します");
        }
      } catch (error) {
        needFetch = true;
      }

      try {
        if (needFetch) {
          // 通信
          const request = new Request("GET", url, {
            preventCache: true,
          });
          if (hasCache) {
            if (cache.lastModified != null) {
              request.headers["If-Modified-Since"] = new Date(
                cache.lastModified,
              ).toUTCString();
            }
            if (cache.etag != null) {
              request.headers["If-None-Match"] = cache.etag;
            }
          }

          response = await request.send();
        }

        // パース
        const responseStatus = response != null ? response.status : undefined;
        if (response != null && responseStatus === 200) {
          idMap = SikiGuard.parse(response.body);
        } else if (hasCache) {
          // cache.data は型上 null になり得る。null の場合、旧実装でも parse 内の
          // try/catch で失敗して空 Map になっていたため、空文字で同じ結果にする。
          idMap = SikiGuard.parse(cache.data ?? "");
        } else if (responseStatus === 404) {
          // NG対象がない場合404が返ってくる
          idMap = new Map();
        }

        if (idMap == null) {
          throw { response };
        }
        // Array.includes は undefined を受け付けないため、等価な比較へ書き換え (挙動は同じ)。
        if (
          !(responseStatus === 200 || responseStatus === 404) &&
          (!(response == null) || !hasCache)
        ) {
          throw { response, idMap };
        }

        // コールバック
        this.idMap = idMap;
        resolve();

        // キャッシュ更新部
        // 三項演算子だと TS が response を非 null に絞り込めないため && に書き換え (挙動は同じ)。
        if (response != null && response.status === 200) {
          let etag;
          cache.data = response.body;
          cache.lastUpdated = Date.now();

          const lastModified = new Date(
            response.headers["Last-Modified"] || "dummy",
          ).getTime();

          if (Number.isFinite(lastModified)) {
            cache.lastModified = lastModified;
          }

          if ((etag = response.headers["ETag"])) {
            cache.etag = etag;
          }

          cache.put();
        }
      } catch (error) {
        // コールバック
        // 上の throw {response, idMap} 形式を想定して取り出す。Error 等が飛んできた場合は
        // idMap が undefined になる (従来の分割代入と同じ挙動)。response は以降未使用のため取り出さない。
        ({ idMap } = /** @type {{ idMap?: Map<string, Set<string>> }} */ (
          error
        ));
        this.message = "Siki Guardの読み込みに失敗しました。";

        if (hasCache && idMap != null) {
          this.message += "キャッシュに残っていたデータを使用します。";
        }

        if (idMap != null) {
          this.idMap = idMap;
        }

        reject();
      }
    });
  }

  /**
  @method get
  @static
  @param {string} url
  */
  static async get(url) {
    const board = new SikiGuard(url);
    try {
      await board.get();
      return { status: "success", data: board.idMap };
    } catch (error) {
      return {
        status: "error",
        message: board.message != null ? board.message : null,
        data: board.idMap !== null ? board.idMap : new Map(),
      };
    }
  }

  /**
  @method _getXhrInfo
  @private
  @static
  @param {URL} threadUrl src/core/URL.ts の URL (getTsld を持つ)
  */
  static _getXhrInfo(threadUrl) {
    const tsld = threadUrl.getTsld();
    const splits = threadUrl.pathname.split("/");

    if (["5ch.io", "bbspink.com"].includes(tsld)) {
      return {
        tsld,
        board: splits[3],
      };
    }

    return null;
  }

  /**
  @method parse
  @static
  @param {string} text
  @return {Map<string, Set<string>>} NG id set
  */
  static parse(text) {
    try {
      // JSON.parse は any を返すため、期待するレスポンス形状を明示する。
      const { result } = /** @type {{ result: Record<string, string[]> }} */ (
        JSON.parse(text)
      );

      /** @type {Map<string, Set<string>>} */
      const idMap = new Map();
      Object.keys(result).forEach((key) => {
        idMap.set(
          `20${key.slice(0, 2)}/${key.slice(2, 4)}/${key.slice(4)}`,
          new Set(result[key].map((id) => `ID:${id}`)),
        );
      });

      return idMap;
    } catch (error) {
      // TODO:
      return new Map();
    }
  }
}
