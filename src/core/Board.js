import { platform } from "src/app";
import { BoardParser, ChURL } from "packages/ch-lib/src/index";
import { container } from "src/service-container/index";
import { chServerMoveDetect } from "src/core/jsutil.js";

/**
@class Board
@constructor
@param {String} url
*/
export default class Board {
  constructor(url) {
    /**
    @property url
    @type String
    */
    this.url = new ChURL(url);

    /**
    @property thread
    @type Array | null
    */
    this.thread = null;

    /**
    @property message
    @type String | null
    */
    this.message = null;
  }

  /**
  @method get
  @return {Promise}
  */
  get() {
    const tmp = Board._getXhrInfo(this.url);
    if (!tmp) {
      return Promise.reject();
    }
    const { path: xhrPath, charset: xhrCharset } = tmp;

    return new Promise(async (resolve, reject) => {
      let bookmark, newBoardUrl, response, thread, threadList;
      let hasCache = false;

      // キャッシュ取得
      const cache = container.cache.getCache(xhrPath);

      let needFetch = false;
      try {
        await cache.get();
        hasCache = true;
        if (!(Date.now() - cache.lastUpdated < 1000 * 3)) {
          throw new Error("キャッシュの期限が切れているため通信します");
        }
      } catch (error1) {
        needFetch = true;
      }

      try {
        if (needFetch) {
          // 通信
          const headers = {};
          if (hasCache) {
            if (cache.lastModified != null) {
              headers["If-Modified-Since"] = new Date(
                cache.lastModified,
              ).toUTCString();
            }
            if (cache.etag != null) {
              headers["If-None-Match"] = cache.etag;
            }
          }

          response = await platform.http.fetch(xhrPath, {
            method: "GET",
            mimeType: `text/plain; charset=${xhrCharset}`,
            headers: headers,
          });
        }

        // パース
        // 2chで自動移動しているときはサーバー移転
        if (
          response != null &&
          this.url.getTsld() === "5ch.io" &&
          this.url.url.hostname !== response.responseURL.split("/")[2]
        ) {
          newBoardUrl = response.responseURL.slice(0, -"subject.txt".length);
          throw { response, newBoardUrl };
        }

        if ((response != null ? response.status : undefined) === 200) {
          threadList = Board.parse(this.url, response.body);
        } else if (hasCache) {
          threadList = Board.parse(this.url, cache.data);
        }

        if (threadList == null) {
          throw { response };
        }
        if (
          (response != null ? response.status : undefined) !== 200 &&
          (response != null ? response.status : undefined) !== 304 &&
          (!(response == null) || !hasCache)
        ) {
          throw { response, threadList };
        }

        //コールバック
        this.thread = threadList;
        resolve();

        //キャッシュ更新部
        if ((response != null ? response.status : undefined) === 200) {
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

          for (thread of threadList) {
            container.bookmark.updateResCount(thread.url, thread.resCount);
          }
        } else if (
          hasCache &&
          (response != null ? response.status : undefined) === 304
        ) {
          cache.lastUpdated = Date.now();
          cache.put();
        }
      } catch (error) {
        console.error("Board GET error:", error);
        //コールバック
        ({ response, threadList, newBoardUrl } = error);
        this.message = "板の読み込みに失敗しました。";

        if (newBoardUrl != null && this.url.getTsld() === "5ch.io") {
          try {
            newBoardUrl = (await chServerMoveDetect(this.url)).href;
            this.message += `\
サーバーが移転しています
(<a href="${container.util.escapeHtml(container.util.safeHref(newBoardUrl))}"
class="open_in_rcrx">${container.util.escapeHtml(newBoardUrl)}
</a>)\
`;
          } catch (error2) {}
          //2chでrejectされている場合は移転を疑う
        } else if (this.url.getTsld() === "5ch.io" && response != null) {
          try {
            newBoardUrl = (await chServerMoveDetect(this.url)).href;
            //移転検出時
            this.message += `\
サーバーが移転している可能性が有ります
(<a href="${container.util.escapeHtml(container.util.safeHref(newBoardUrl))}"
class="open_in_rcrx">${container.util.escapeHtml(newBoardUrl)}
</a>)\
`;
          } catch (error3) {}
          if (hasCache && threadList != null) {
            this.message += "キャッシュに残っていたデータを表示します。";
          }

          if (threadList) {
            this.thread = threadList;
          }
        } else {
          if (hasCache && threadList != null) {
            this.message += "キャッシュに残っていたデータを表示します。";
          }

          if (threadList != null) {
            this.thread = threadList;
          }
        }
        reject();
      }

      // dat落ちスキャン
      if (!threadList || threadList.length === 0) {
        return;
      }
      const dict = {};
      for (bookmark of (container.bookmark.getByBoard(this.url.url.href) ?? [])) {
        if (bookmark.type === "thread") {
          dict[bookmark.url] = true;
        }
      }

      for (thread of threadList) {
        if (dict[thread.url] != null) {
          dict[thread.url] = false;
          container.bookmark.updateExpired(thread.url, false);
        }
      }

      for (let threadUrl in dict) {
        const val = dict[threadUrl];
        if (val) {
          container.bookmark.updateExpired(threadUrl, true);
        }
      }
    });
  }

  /**
  @method get
  @static
  @param {String} url
  @return {Promise}
  */
  static async get(url) {
    const board = new Board(url);
    try {
      await board.get();
      return { status: "success", data: board.thread };
    } catch (error) {
      return {
        status: "error",
        message: board.message != null ? board.message : null,
        data: board.thread != null ? board.thread : null,
      };
    }
  }

  /**
  @method _getXhrInfo
  @private
  @static
  @param {app.URL.URL} boardUrl
  @return {Object | null} xhrInfo
  */
  static _getXhrInfo(boardUrl) {
    const tmp = new RegExp(`^/(\\w+)(?:/(\\d+)/|/?)$`).exec(
      boardUrl.url.pathname,
    );
    if (!tmp) {
      return null;
    }
    switch (boardUrl.getTsld()) {
      case "machi.to":
        return {
          path: `${boardUrl.url.origin}/bbs/offlaw.cgi/${tmp[1]}/`,
          charset: "Shift_JIS",
        };
      case "shitaraba.net":
        return {
          path: `${boardUrl.url.protocol}//jbbs.shitaraba.net/${tmp[1]}/${tmp[2]}/subject.txt`,
          charset: "EUC-JP",
        };
      default:
        return {
          path: `${boardUrl.url.origin}/${tmp[1]}/subject.txt`,
          charset: "Shift_JIS",
        };
    }
  }

  /**
  @method parse
  @static
  @param {app.URL.URL} url
  @param {String} text
  @return {Array | null} board
  */
  static parse(url, text) {
    const scFlg = url.getTsld() === "2ch.sc";
    const threads = BoardParser.parse(url, text);

    return threads.map((thread) => {
      const ngResult = container.ng.isNGBoard(
        thread.title,
        url.url.href,
        thread.resCount,
      );
      const highlight =
        ngResult &&
        (ngResult.type === "HighlightTitle" ||
          ngResult.type === "RegExpHighlightTitle");

      return {
        ...thread,
        ng: highlight ? null : ngResult,
        highlight: highlight ? ngResult : null,
        isNet: scFlg ? !thread.title.startsWith("★") : null,
      };
    });
  }

  /**
  @method getCachedResCount
  @static
  @param {String} threadUrl
  @return {Promise}
  */
  static async getCachedResCount(threadUrl) {
    const boardUrl = threadUrl.toBoardURL();
    const xhrPath = __guard__(Board._getXhrInfo(boardUrl), (x) => x.path);

    if (xhrPath == null) {
      throw new Error("その板の取得方法の情報が存在しません");
    }

    const cache = container.cache.getCache(xhrPath);
    try {
      await cache.get();
    } catch (e) {
      throw new Error("No cached board data");
    }
    const { lastModified, data } = cache;
    const threads = Board.parse(boardUrl, data);
    if (!threads) {
      throw new Error("No cached board data");
    }
    for (let { url, resCount } of threads) {
      if (url === threadUrl.url.href) {
        return {
          resCount,
          modified: lastModified,
        };
      }
    }
    throw new Error("板のスレ一覧にそのスレが存在しません");
  }
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
