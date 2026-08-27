import {
  BoardParser,
  ChURL,
  type BoardThread as CanonicalBoardThread,
} from "packages/ch-lib/src/index";
import { platform } from "src/app";
import { Response } from "src/core/HTTP";
import { chServerMoveDetect } from "src/core/jsutil";
import { container } from "src/service-container/index";

// JSDocの型情報をTypeScriptに変換。subject parserの基本形はch-libを正とし、
// NG／表示状態だけをChlens側のBoard projectionとして追加する。
type BoardThread = CanonicalBoardThread & {
  ng?: unknown;
  demoted?: unknown;
  highlight?: unknown;
  isNet?: boolean | null;
};

interface XhrInfo {
  path: string;
  charset: string;
}

interface BoardResponse {
  status: "success" | "error";
  message?: string | null;
  data: BoardThread[] | null;
}

/**
 * 板（スレ一覧）を取得・解析するクラス
 */
export default class Board {
  url: ChURL;
  thread: BoardThread[] | null = null;
  message: string | null = null;

  constructor(url: string | ChURL) {
    this.url = url instanceof ChURL ? url : new ChURL(url);
  }

  /**
   * 板のスレ一覧を取得して解析します
   */
  get(): Promise<void> {
    const tmp = Board._getXhrInfo(this.url);
    if (!tmp) {
      return Promise.reject(new Error("取得方法が不明な板です"));
    }
    const { path: xhrPath, charset: xhrCharset } = tmp;

    return new Promise((resolve, reject) => {
      void (async () => {
        let bookmark;
        let newBoardUrl: string | undefined;
        let response: Response | undefined;
        let thread;
        let threadList: BoardThread[] | null | undefined;
        let hasCache = false;

        // キャッシュ取得
        const cache = container.cache.getCache(xhrPath);

        let needFetch = false;
        try {
          await cache.get();
          hasCache = true;
          // キャッシュが3秒以内の場合のみ使用
          if (!(Date.now() - cache.lastUpdated < 1000 * 3)) {
            throw new Error("キャッシュの期限が切れているため通信します");
          }
        } catch {
          needFetch = true;
        }

        try {
          if (needFetch) {
            // 条件付きGETリクエストの設定
            const headers: Record<string, string> = {};
            if (hasCache) {
              if (cache.lastModified != null) {
                headers["If-Modified-Since"] = new Date(cache.lastModified).toUTCString();
              }
              if (cache.etag != null) {
                headers["If-None-Match"] = cache.etag;
              }
            }

            const httpResponse = await platform.http.fetch(xhrPath, {
              method: "GET",
              mimeType: `text/plain; charset=${xhrCharset}`,
              headers: headers,
            });
            // HttpResponseをResponseに変換
            response = new Response(
              httpResponse.status,
              httpResponse.headers,
              httpResponse.body,
              httpResponse.url,
            );
          }

          // サーバー移転判定
          // 2chで自動移動しているときはサーバー移転
          if (
            response != null &&
            this.url.getTsld() === "5ch.io" &&
            response.responseURL != null &&
            this.url.url.hostname !== response.responseURL.split("/")[2]
          ) {
            newBoardUrl = response.responseURL.slice(0, -"subject.txt".length);
            throw { response, newBoardUrl };
          }

          // レスポンスボディの処理とパース
          if (response?.status === 200) {
            if (response.body == null) {
              // レスポンスボディが空の場合はキャッシュを使用
              if (hasCache && cache.data) {
                threadList = Board.parse(this.url, cache.data);
              } else {
                throw new Error("レスポンスボディが空です");
              }
            } else {
              threadList = Board.parse(this.url, response.body);
            }
          } else if (hasCache && cache.data) {
            threadList = Board.parse(this.url, cache.data);
          }

          if (threadList == null) {
            throw { response };
          }

          // ステータスコードの検証
          if (
            response?.status !== 200 &&
            response?.status !== 304 &&
            // ネットワーク応答が無くても、キャッシュから一覧を復元できた場合は成功扱いにする。
            // （戻る遷移などで3秒以内キャッシュを読むケースで誤ってエラー化しないため）
            !hasCache
          ) {
            throw { response, threadList };
          }

          // 成功時の処理
          this.thread = threadList;
          resolve();

          // キャッシュ更新処理
          if (response?.status === 200) {
            cache.data = response.body;
            cache.lastUpdated = Date.now();

            const lastModified = new Date(response.headers["Last-Modified"] || "dummy").getTime();

            if (Number.isFinite(lastModified)) {
              cache.lastModified = lastModified;
            }

            const etag = response.headers["ETag"];
            if (etag) {
              cache.etag = etag;
            }

            await cache.put();

            // ブックマークのレス数を更新
            for (thread of threadList) {
              container.bookmark.updateResCount(thread.url, thread.resCount);
            }
          } else if (hasCache && response?.status === 304) {
            // 304 Not Modifiedの場合、最終更新時刻のみ更新
            cache.lastUpdated = Date.now();
            await cache.put();
          }
        } catch (error: unknown) {
          console.error("Board GET error:", error);

          // エラーの詳細を取得
          const errorObj = error as Record<string, unknown>;
          response = (errorObj.response as Response) || response;
          threadList = (errorObj.threadList as BoardThread[]) || threadList;
          newBoardUrl = (errorObj.newBoardUrl as string) || newBoardUrl;

          this.message = "板の読み込みに失敗しました。";

          // サーバー移転の検出試行
          if (newBoardUrl != null && this.url.getTsld() === "5ch.io") {
            try {
              newBoardUrl = (await chServerMoveDetect(this.url)).href;
              this.message += `\
サーバーが移転しています
(<a href="${container.util.escapeHtml(container.util.safeHref(newBoardUrl))}"
class="open_in_rcrx">${container.util.escapeHtml(newBoardUrl)}
</a>)\
`;
            } catch {
              // サーバー移転検出失敗
            }
          } else if (this.url.getTsld() === "5ch.io" && response != null) {
            try {
              newBoardUrl = (await chServerMoveDetect(this.url)).href;
              this.message += `\
サーバーが移転している可能性が有ります
(<a href="${container.util.escapeHtml(container.util.safeHref(newBoardUrl))}"
class="open_in_rcrx">${container.util.escapeHtml(newBoardUrl)}
</a>)\
`;
            } catch {
              // サーバー移転検出失敗
            }

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

        const dict: Record<string, boolean> = {};
        const bookmarks = container.bookmark.getByBoard(this.url.url.href) ?? [];
        for (bookmark of bookmarks) {
          if (bookmark.type === "thread") {
            dict[bookmark.url] = true;
          }
        }

        // 存在するスレッドをマーク
        for (thread of threadList) {
          if (thread.url in dict) {
            dict[thread.url] = false;
            container.bookmark.updateExpired(thread.url, false);
          }
        }

        // dat落ちしたスレッドをマーク
        for (const threadUrl in dict) {
          const val = dict[threadUrl];
          if (val) {
            container.bookmark.updateExpired(threadUrl, true);
          }
        }
      })();
    });
  }

  /**
   * 板のスレ一覧を取得する（静的メソッド）
   */
  static async get(url: string): Promise<BoardResponse> {
    const board = new Board(url);
    try {
      await board.get();
      return { status: "success", data: board.thread };
    } catch {
      return {
        status: "error",
        message: board.message ?? null,
        data: board.thread ?? null,
      };
    }
  }

  /**
   * 板のURLから取得方法の情報を取得します
   */
  private static _getXhrInfo(boardUrl: ChURL): XhrInfo | null {
    const tmp = new RegExp(`^/(\\w+)(?:/(\\d+)/|/?)$`).exec(boardUrl.url.pathname);
    if (!tmp) {
      return null;
    }

    const boardName = tmp[1];
    const categoryId = tmp[2];

    switch (boardUrl.getTsld()) {
      case "machi.to":
        return {
          path: `${boardUrl.url.origin}/bbs/offlaw.cgi/${boardName}/`,
          charset: "Shift_JIS",
        };
      case "shitaraba.net":
        return {
          path: `${boardUrl.url.protocol}//jbbs.shitaraba.net/${boardName}/${categoryId}/subject.txt`,
          charset: "EUC-JP",
        };
      default:
        return {
          path: `${boardUrl.url.origin}/${boardName}/subject.txt`,
          charset: "Shift_JIS",
        };
    }
  }

  /**
   * 板のテキストをパースして、スレ一覧を取得します
   */
  static parse(url: ChURL, text: string): BoardThread[] | null {
    const scFlg = url.getTsld() === "2ch.sc";
    const threads = BoardParser.parse(url, text);

    // nullチェック
    if (!threads || threads.length === 0) {
      return null;
    }

    return threads.map((thread: BoardThread) => {
      const ngResult = container.ng.isNGBoard(thread.title, url.url.href, thread.resCount);
      // 変更理由: hide / demote / highlight を型名の推測ではなくDSL actionで分離する。
      const highlight =
        ngResult?.action === "highlight" ||
        ngResult?.type === "HighlightTitle" ||
        ngResult?.type === "RegExpHighlightTitle";
      const demoted = ngResult?.action === "demote";

      return {
        ...thread,
        ng: highlight || demoted ? null : ngResult,
        demoted: demoted ? ngResult : null,
        highlight: highlight ? ngResult : null,
        isNet: scFlg ? !thread.title.startsWith("★") : null,
      };
    });
  }

  /**
   * キャッシュからスレッドのレス数を取得します
   */
  static async getCachedResCount(
    threadUrl: string,
  ): Promise<{ resCount: number; modified: number }> {
    // ChURLのメソッドを呼び出すために、threadUrlをChURLに変換
    const chUrl = new ChURL(threadUrl);
    const boardUrl = chUrl.toBoard?.();
    if (!boardUrl) {
      throw new Error("スレッドURLの形式が不正です");
    }

    const xhrInfo = Board._getXhrInfo(boardUrl);
    if (!xhrInfo) {
      throw new Error("その板の取得方法の情報が存在しません");
    }

    const cache = container.cache.getCache(xhrInfo.path);
    try {
      await cache.get();
    } catch {
      throw new Error("No cached board data");
    }

    const { lastModified, data } = cache;
    const cachedThreads = Board.parse(boardUrl, data!);
    if (!cachedThreads) {
      throw new Error("No cached board data");
    }
    let threads: BoardThread[] = cachedThreads;

    const findThread = () => threads.find(({ url }) => new ChURL(url).url.href === chUrl.url.href);
    let thread = findThread();

    // 変更理由: subject キャッシュは古い・不完全なことがあるため、不在時は
    // 最新のsubject.txtを確認してから dat落ち表示の対象にする。
    if (!thread) {
      const board = new Board(boardUrl);
      await board.get();
      if (!board.thread) {
        throw new Error("No refreshed board data");
      }
      threads = board.thread;
      thread = findThread();
    }

    if (thread) {
      return {
        resCount: thread.resCount,
        modified: lastModified ?? Date.now(),
      };
    }

    throw new Error("板のスレ一覧にそのスレが存在しません");
  }
}
