import { get as getBBSMenu } from "src/core/BBSMenu.js";
import Board from "src/core/Board.js";
import { Request } from "src/core/HTTP.ts";
import { URL } from "src/core/URL.ts";
import { levenshteinDistance } from "src/core/Util.ts";

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

    str = app.replaceAll(str, "\u30fc", "-");
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

const boardUrlReg = /^https?:\/\/\w+\.5ch\.net\/(\w+)\/$/;
//2chの鯖移転検出関数
//移転を検出した場合は移転先のURLをresolveに載せる
//検出出来なかった場合はrejectする
//htmlを渡す事で通信をスキップする事が出来る
/**
 * @param {URL | { url?: unknown } | null | undefined} oldBoardUrl 板URL (app.URL.URL または ch-lib の ChURL)
 * @param {string} [html]
 */
export var chServerMoveDetect = async function (oldBoardUrl, html) {
  // 呼び出し元によって app.URL.URL と ch-lib の ChURL が混在するため、
  // ここで生の URL インスタンスへ正規化して undefined URL リクエストを防ぐ。
  // instanceof を先に判定する形にしているのは型の絞り込みのためで、
  // URL インスタンスは .url プロパティを持たないので判定結果は従来と同じ。
  let normalizedOldBoardUrl;
  if (oldBoardUrl instanceof window.URL) {
    normalizedOldBoardUrl = oldBoardUrl;
  } else if (oldBoardUrl != null && oldBoardUrl.url instanceof window.URL) {
    normalizedOldBoardUrl = oldBoardUrl.url;
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
  const res = new RegExp(`location\\.href="(https?://(\\w+\\.)?5ch\\.net/\\w*/)"`).exec(html);
  if (res) {
    let newBoardUrlTmp;
    if (res[2] != null) {
      newBoardUrlTmp = new URL(res[1]);
    } else {
      const { responseURL } = await new Request("GET", res[1]).send();
      newBoardUrlTmp = new URL(responseURL);
    }
    newBoardUrlTmp.protocol = "http";
    if (newBoardUrlTmp.hostname !== normalizedOldBoardUrl.hostname) {
      newBoardUrl = newBoardUrlTmp;
    }
  }

  //bbsmenuから検索
  if (newBoardUrl == null) {
    newBoardUrl = await (async function () {
      const { menu: data } = await getBBSMenu();
      if (data == null) {
        throw new Error("BBSMenuの取得に失敗しました");
      }
      const boardKey = __guard__(normalizedOldBoardUrl.pathname.split("/"), (x) => x[1]);
      if (!boardKey) {
        throw new Error("板のURL形式が不明です");
      }
      // BBSMenu のデータ構造は BBSMenuParser 導入時に
      // 「カテゴリ配列 (category.board)」から「menu[].categories[].boards[]」へ変わったが、
      // このレガシー関数だけ旧形式のまま走査しており移転先を見つけられなくなっていた。
      // 新形式に合わせて三重ループへ修正する。
      for (let menuDoc of data) {
        for (let category of menuDoc.categories) {
          for (let board of category.boards) {
            const m = board.url.match(boardUrlReg);
            if (m != null) {
              const newUrl = new URL(m[0]);
              newUrl.protocol = "http:";
              if (boardKey === m[1] && normalizedOldBoardUrl.hostname !== newUrl.hostname) {
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
  app.message.send("detected_ch_server_move", {
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
  const threadUrl = new URL(threadUrlStr);
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
      const m = url.match(/(?:https:\/\/)?(?:\w+(\.[25]ch\.net\/.+)|(.+))$/);
      // m が null のケース (旧実装では実行時エラーになっていた) は url をそのまま検索する。
      const matched = m == null ? null : m[1] != null ? m[1] : m[2];
      if (resString.includes(matched != null ? matched : url)) {
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
  str = app.replaceAll(app.replaceAll(str, "\u0020", ""), "\u3000", "");
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
  return app.replaceAll(app.replaceAll(title, "<mark>", ""), "</mark>", "");
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

/**
 * IReadState (offset?: number) と BookmarkEntryList.ReadState (offset?: number | null) の
 * 両方を受け取れるよう、比較に使うフィールドだけの構造的な型で宣言する。
 * @typedef {{ received: number, read: number, last: number, offset?: number | null, date?: number | null }} ComparableReadState
 * @param {ComparableReadState | null | undefined} a
 * @param {ComparableReadState | null | undefined} b
 */
export var isNewerReadState = function (a, b) {
  if (!b) {
    return false;
  }
  if (!a) {
    return true;
  }

  if (a.received !== b.received) {
    return a.received < b.received;
  }
  if (a.read !== b.read) {
    return a.read < b.read;
  }
  if (a.date && b.date) {
    return a.date < b.date;
  } else if (a.date) {
    return false;
  } else if (b.date) {
    return true;
  }
  if (a.last !== b.last) {
    return true;
  }
  if (a.offset !== b.offset) {
    return true;
  }

  return false;
};

/**
 * @template T, R
 * @param {T | null | undefined} value
 * @param {(value: T) => R} transform
 * @returns {R | undefined}
 */
function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null ? transform(value) : undefined;
}
