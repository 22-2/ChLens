import { ask as askBoardTitleSolver } from "src/core/BoardTitleSolver.js";
import { Request } from "src/core/HTTP.ts";
import { decodeCharReference } from "src/core/jsutil.js";
import { setProtocol, URL } from "src/core/URL.ts";

// decaffeinate 由来の initClass パターン (prototype への代入) は TS が
// プロパティを認識できないため、通常のクラスフィールドとモジュール関数へ書き換えた。
// 挙動は従来と同じ。

/**
 * 検索RSSの <item> 要素をスレ情報オブジェクトへ変換する関数を作る。
 * @param {string} protocol
 */
const _parse = (protocol) =>
  /** @param {Element} item */
  async function (item) {
    let boardTitle;
    // textContent は型上 null になり得るため空文字へフォールバックする
    // (要素が欠けた不正なRSSでも従来同様パース続行させる)。
    const url = item.T("guid")[0].textContent ?? "";
    let title = decodeCharReference(item.T("title")[0].textContent ?? "");
    const m = title.match(/\((\d+)\)$/);
    title = title.replace(/\(\d+\)$/, "");
    // 旧コードの app.URL.URL はグローバル参照だったが、型解決のため直接 import した同じクラスを使う。
    const boardUrl = new URL(url).toBoard();
    try {
      boardTitle = await askBoardTitleSolver(boardUrl);
      } catch {
        boardTitle = "";
    }
    return {
      url: setProtocol(url, protocol),
      createdAt: Date.parse(item.T("pubDate")[0].textContent ?? ""),
      title,
      resCount: m != null ? m[1] : 0,
      boardUrl: boardUrl.href,
      boardTitle,
      isHttps: protocol === "https:",
    };
  };

// _getDiff は下部のコメントアウトされた段階読み込み実装でのみ使われるため、
// noUnusedLocals に引っかからないよう実装ごとコメントアウトして残す。
// const _getDiff = function (a, b) {
//   const diffed = [];
//   const aUrls = [];
//   for (let aVal of a) {
//     aUrls.push(aVal.url);
//   }
//   for (let bVal of b) {
//     if (!aUrls.includes(bVal.url)) {
//       diffed.push(bVal);
//     }
//   }
//   return diffed;
// };

export default class ThreadSearch {
  /** @type {"None" | "Small" | "Big"} */
  loaded = "None";
  /** @type {Promise<unknown> | null} */
  loaded20 = null;

  /**
   * @param {string} query
   * @param {string} protocol
   */
  constructor(query, protocol) {
    this.query = query;
    this.protocol = protocol;
  }
  /*
    return ({url, key, subject, resno, server, ita}) ->
      urlProtocol = getProtocol(url)
      boardUrl = new URL("#{urlProtocol}//#{server}/#{ita}/")
      try
        boardTitle = await askBoardTitleSolver(boardUrl)
      catch
        boardTitle = ""
      return {
        url: setProtocol(url, protocol)
        createdAt: stampToDate(key)
        title: decodeCharReference(subject)
        resCount: +resno
        boardUrl: boardUrl.href
        boardTitle
        isHttps: (protocol is "https:")
      }
    */

  /** @param {number} [_count] */
  async _read(_count) {
    //{status, body} = await new Request("GET", "https://dig.5ch.io/?keywords=#{encodeURIComponent(@query)}&maxResult=#{count}&json=1",
    let result;
    // `cache: false` は Request に存在しないオプションで黙って無視されていた。
    // 「検索結果はキャッシュさせない」という意図に合わせ preventCache へ修正。
    const { status, body } = await new Request(
      "GET",
      `https://ff5ch.syoboi.jp/?q=${encodeURIComponent(this.query)}&alt=rss`,
      { preventCache: true },
    ).send();
    if (status !== 200) {
      throw new Error("検索の通信に失敗しました");
    }
    try {
      const parser = new DOMParser();
      const rss = parser.parseFromString(body, "application/xml");
      result = Array.from(rss.T("item"));
      //{result} = JSON.parse(body)
    } catch (error) {
      throw new Error("検索のJSONのパースに失敗しました", { cause: error });
    }
    return Promise.all(result.map(_parse(this.protocol)));
  }

  read() {
    if (this.loaded === "None") {
      this.loaded = "Big";
      return this._read();
    }
    return [];
  }
}
/*
    if @loaded is "None"
      @loaded = "Small"
      @loaded20 = @_read(20)
      return @loaded20
    if @loaded is "Small"
      @loaded = "Big"
      return _getDiff(await @loaded20, await @_read(500))
    return []
    */
