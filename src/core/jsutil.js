import {
  ChURL,
  extractBoardServerInfo,
  getBoardNetwork,
  getThreadReferenceKeys,
  resolveBoardMoveUrl,
} from "packages/ch-lib/src/index";
import Board from "src/core/Board.js";
import { Request } from "src/core/HTTP.ts";
import { levenshteinDistance } from "src/core/Util.ts";
import { container } from "src/service-container/index";

/**
@class Anchor
スレッドフロートBBSで用いられる「アンカー」形式の文字列を扱う。
*/
export var Anchor = {
  reg: {
    ANCHOR:
      /(?:&gt;|＞){1,2}[\d\uff10-\uff19]+(?:[-\u30fc][\d\uff10-\uff19]+)?(?:\s*[,、]\s*[\d\uff10-\uff19]+(?:[-\u30fc][\d\uff10-\uff19]+)?)*/g,
    _FW_NUMBER: /[\uff10-\uff19]/g,
  },

  /** @param {string} str */
  parseAnchor(str) {
    let segment;
    const data = {
      targetCount: 0,
      /** @type {[number, number][]} */
      segments: [],
    };

    str = str.replaceAll("\u30fc", "-");
    str = str.replace(Anchor.reg._FW_NUMBER, ($0) => String.fromCharCode($0.charCodeAt(0) - 65248));

    if (!/^(?:&gt;|＞){0,2}([\d]+(?:-\d+)?(?:\s*[,、]\s*\d+(?:-\d+)?)*)$/.test(str)) {
      return data;
    }

    const segReg = /(\d+)(?:-(\d+))?/g;
    while ((segment = segReg.exec(str))) {
      // 桁数の大きすぎる値は無視
      var segrangeEnd, segrangeStart;
      // (undefined > 5) は常に false なので、undefined を比較に混ぜず素直に書き直した (挙動は同じ)。
      if (segment[1].length > 5 || (segment[2] != null && segment[2].length > 5)) {
        continue;
      }
      // 1以下の値は無視
      if (+segment[1] < 1) {
        continue;
      }

      if (segment[2]) {
        if (+segment[1] <= +segment[2]) {
          segrangeStart = +segment[1];
          segrangeEnd = +segment[2];
        } else {
          segrangeStart = +segment[2];
          segrangeEnd = +segment[1];
        }
      } else {
        segrangeStart = segrangeEnd = +segment[1];
      }

      data.targetCount += segrangeEnd - segrangeStart + 1;
      data.segments.push([segrangeStart, segrangeEnd]);
    }
    return data;
  },
};

//2chの鯖移転検出関数
//移転を検出した場合は移転先のURLをresolveに載せる
//検出出来なかった場合はrejectする
//htmlを渡す事で通信をスキップする事が出来る
/**
 * @param {URL | { url?: unknown } | null | undefined} oldBoardUrl
 * @param {string} [html]
 */
export var chServerMoveDetect = async function (oldBoardUrl, html) {
  // app URL APIから渡る値もChURLへ揃え、以降の板URL処理を一つの型に統一する。
  let normalizedOldBoardUrl;
  if (oldBoardUrl instanceof ChURL) {
    normalizedOldBoardUrl = oldBoardUrl;
  } else if (oldBoardUrl instanceof window.URL) {
    normalizedOldBoardUrl = new ChURL(oldBoardUrl.href);
  } else if (oldBoardUrl != null && oldBoardUrl.url instanceof window.URL) {
    normalizedOldBoardUrl = new ChURL(oldBoardUrl.url.href);
  } else {
    throw new Error("板URLの型が不正です");
  }

  let newBoardUrl;
  normalizedOldBoardUrl.protocol = "http:";
  if (typeof html !== "string") {
    //htmlが渡されなかった場合は通信する
    let status;
    // `cache: false` は Request が持たないオプションで黙って無視されていた。
    // 「キャッシュを使わず最新のHTMLで移転判定する」という本来の意図に合わせ preventCache に修正。
    ({ status, body: html } = await new Request("GET", normalizedOldBoardUrl.href, {
      mimeType: "text/html; charset=Shift_JIS",
      preventCache: true,
    }).send());
    if (status !== 200) {
      throw new Error("サーバー移転判定のための通信に失敗しました");
    }
  }

  //htmlから移転を判定
  const res = /location\.href="(https?:\/\/[^"]+)"/.exec(html);
  if (res) {
    let redirectedBoardUrl = resolveBoardMoveUrl(normalizedOldBoardUrl, res[1]);
    if (redirectedBoardUrl == null && getBoardNetwork(res[1]) === "5ch") {
      const { responseURL } = await new Request("GET", res[1]).send();
      redirectedBoardUrl = resolveBoardMoveUrl(normalizedOldBoardUrl, res[1], responseURL);
    }
    if (redirectedBoardUrl != null) {
      const newBoardUrlTmp = new ChURL(redirectedBoardUrl);
      newBoardUrlTmp.protocol = "http:";
      if (newBoardUrlTmp.hostname !== normalizedOldBoardUrl.hostname) {
        newBoardUrl = newBoardUrlTmp;
      }
    }
  }

  //bbsmenuから検索
  if (newBoardUrl == null) {
    newBoardUrl = await (async function () {
      const { menu: data } = await container.bbsMenu.get();
      if (data == null) {
        throw new Error("BBSMenuの取得に失敗しました");
      }
      const sourceInfo = extractBoardServerInfo(normalizedOldBoardUrl.href);
      if (!sourceInfo) throw new Error("板のURL形式が不明です");
      // BBSMenu のデータ構造は BBSMenuParser 導入時に
      // 「カテゴリ配列 (category.board)」から「menu[].categories[].boards[]」へ変わったが、
      // このレガシー関数だけ旧形式のまま走査しており移転先を見つけられなくなっていた。
      // 新形式に合わせて三重ループへ修正する。
      for (let menuDoc of data) {
        for (let category of menuDoc.categories) {
          for (let board of category.boards) {
            const destinationInfo = extractBoardServerInfo(board.url);
            if (
              destinationInfo?.boardName === sourceInfo.boardName &&
              destinationInfo.network === sourceInfo.network
            ) {
              const newUrl = new ChURL(board.url);
              newUrl.protocol = "http:";
              if (normalizedOldBoardUrl.hostname !== newUrl.hostname) {
                return newUrl;
              }
            }
          }
        }
      }
      throw new Error("BBSMenuにその板のサーバー情報が存在しません");
    })();
  }

  //移転を検出した場合は移転検出メッセージを送出
  container.message.send("detected_ch_server_move", {
    before: normalizedOldBoardUrl.href,
    after: newBoardUrl.href,
  });
  return newBoardUrl;
};

//文字参照をデコード
const $span = document.createElement("span");
/** @param {string} str */
export var decodeCharReference = (str) =>
  str.replace(/&(?:#(\d+)|#x([\dA-Fa-f]+)|([\da-zA-Z]+));/g, function ($0, $1, $2, $3) {
    //数値文字参照 - 10進数
    if ($1 != null) {
      return String.fromCodePoint($1);
    }
    //数値文字参照 - 16進数
    if ($2 != null) {
      return String.fromCodePoint(parseInt($2, 16));
    }
    //文字実体参照
    if ($3 != null) {
      $span.innerHTML = $0;
      // textContent は型上 null になり得るが、その場合は元の文字列をそのまま返す。
      return $span.textContent ?? $0;
    }
    return $0;
  });

//マウスクリックのイベントオブジェクトから、リンク先をどう開くべきかの情報を導く
const openMap = new Map([
  //button(number), shift(bool), ctrl(bool)の文字列
  ["0falsefalse", { newTab: false, newWindow: false, background: false }],
  ["0truefalse", { newTab: false, newWindow: true, background: false }],
  ["0falsetrue", { newTab: true, newWindow: false, background: true }],
  ["0truetrue", { newTab: true, newWindow: false, background: false }],
  ["1falsefalse", { newTab: true, newWindow: false, background: true }],
  ["1truefalse", { newTab: true, newWindow: false, background: false }],
  ["1falsetrue", { newTab: true, newWindow: false, background: true }],
  ["1truetrue", { newTab: true, newWindow: false, background: false }],
]);
/**
 * @param {{ type: string, button: number, shiftKey: boolean, ctrlKey: boolean, metaKey: boolean }} event
 *   MouseEvent 互換のオブジェクト
 */
export var getHowToOpen = function ({ type, button, shiftKey, ctrlKey, metaKey }) {
  if (!ctrlKey) {
    ctrlKey = metaKey;
  }
  const def = { newTab: false, newWindow: false, background: false };
  if (type === "mousedown") {
    const key = "" + button + shiftKey + ctrlKey;
    if (openMap.has(key)) {
      return openMap.get(key);
    }
  }
  return def;
};

/**
 * @param {string} threadUrlStr
 * @param {string} threadTitle
 * @param {string} resString
 */
export var searchNextThread = async function (threadUrlStr, threadTitle, resString) {
  const threadUrl = new ChURL(threadUrlStr);
  const boardUrl = threadUrl.toBoard();
  threadTitle = normalize(threadTitle);

  // Board.get は文字列URLを受け取る契約なので href で渡す (URLインスタンスを渡すと型エラー)。
  const { data: threads } = await Board.get(boardUrl.href);
  if (threads == null) {
    throw new Error("板の取得に失敗しました");
  }
  // 元コードは threads を再代入していたが、要素型が BoardThread から
  // {score, title, url} に変わるため別変数に分ける (挙動は同じ)。
  const candidates = threads
    .filter(({ url, resCount }) => url !== threadUrl.href && resCount < 1001)
    .map(function ({ title, url }) {
      let score = levenshteinDistance(threadTitle, normalize(title), false);
      // 変更理由: 投稿本文内のURL照合でホスト別の省略規則を重複させない。
      const referenceKeys = getThreadReferenceKeys(url);
      if (referenceKeys.some((key) => resString.includes(key))) {
        score -= 3;
      }
      return { score, title, url };
    })
    .sort((a, b) => a.score - b.score);
  return candidates.slice(0, 5);
};

const wideSlimNormalizeReg = new RegExp(
  `[\
\
\\uff01-\\uff5d\
\
\\uff66-\\uff9d\
]+`,
  "g",
);
const kataHiraReg = new RegExp(
  `[\
\\u30a1-\\u30f3\
]`,
  "g",
);
// 検索用に全角/半角や大文字/小文字を揃える
/** @param {string} str */
export var normalize = function (str) {
  str = str
    // 全角記号/英数を半角記号/英数に、半角カタカナを全角カタカナに変換
    .replace(wideSlimNormalizeReg, (s) => s.normalize("NFKC"))
    // カタカナをひらがなに変換
    .replace(kataHiraReg, ($0) => String.fromCharCode($0.charCodeAt(0) - 96));
  // 全角スペース/半角スペースを削除
  str = str.replaceAll("\u0020", "").replaceAll("\u3000", "");
  // 大文字を小文字に変換
  return str.toLowerCase();
};

// striptags
/** @param {string} str */
export var stripTags = (str) => str.replace(/<[^>]+>/gi, "");

const titleReg =
  / ?(?:\[(?:無断)?転載禁止\]|(?:\(c\)|©|�|&copy;|&#169;)(?:2ch\.net|@?bbspink\.com)) ?/g;
// タイトルから無断転載禁止などを取り除く
/** @param {string} title */
export var removeNeedlessFromTitle = function (title) {
  const title2 = title.replace(titleReg, "");
  title = title2 === "" ? title : title2;
  return title.replaceAll("<mark>", "").replaceAll("</mark>", "");
};

/** @param {Promise<unknown>} promise */
export var promiseWithState = function (promise) {
  let state = "pending";
  promise.then(
    function () {
      state = "resolved";
    },
    function () {
      state = "rejected";
    },
  );
  return {
    isResolved() {
      return state === "resolved";
    },
    isRejected() {
      return state === "rejected";
    },
    getState() {
      return state;
    },
    promise,
  };
};

/** @param {IDBRequest} req */
export var indexedDBRequestToPromise = (req) =>
  new Promise(function (resolve, reject) {
    req.onsuccess = resolve;
    req.onerror = reject;
  });

/** @param {number} stamp UNIXタイムスタンプ (秒) */
export var stampToDate = (stamp) => new Date(stamp * 1000);

/** @param {string} string */
export var stringToDate = function (string) {
  const date = string.match(
    /(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\(.\))?\s?(\d{1,2}):(\d\d)(?::(\d\d)(?:\.\d+)?)?/,
  );
  let flg = false;
  if (date != null) {
    if (date[1] != null) {
      flg = true;
    }
    if (date[2] == null || !(1 <= +date[2] && +date[2] <= 12)) {
      flg = false;
    }
    if (date[3] == null || !(1 <= +date[3] && +date[3] <= 31)) {
      flg = false;
    }
    if (date[4] == null || !(0 <= +date[4] && +date[4] <= 23)) {
      flg = false;
    }
    if (date[5] == null || !(0 <= +date[5] && +date[5] <= 59)) {
      flg = false;
    }
    if (date[6] == null || !(0 <= +date[6] && +date[6] <= 59)) {
      // match 結果の配列は string 型なので、数値 0 ではなく "0" を入れる (数値化は下の + で行う)。
      date[6] = "0";
    }
  }
  // flg が true なら date は非 null だが、型の絞り込みのため明示的に併記する。
  // Date コンストラクタは数値を要求するため + で変換する (従来は暗黙変換に依存していた)。
  if (flg && date != null) {
    return new Date(+date[1], +date[2] - 1, +date[3], +date[4], +date[5], +date[6]);
  }
  return null;
};

// 変更理由: 既読状態の比較は依存の少ない read-state-compare.ts へ移した。
// 既存の `app.util.isNewerReadState` と jsutil 経由の呼び出し互換のため再エクスポートする。
export { isNewerReadState } from "src/core/read-state-compare.ts";
