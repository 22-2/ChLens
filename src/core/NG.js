import { container } from "src/service-container/index";
import { decodeCharReference, normalize, stringToDate } from "src/core/jsutil.js";
import { convertUserToInternal, tryParseJSON5Rules } from "src/core/NGConverter";
import {
  extractNgDslFunctionCall,
  normalizeNgDslKeyword,
  parseNgDslArguments,
  splitNgDslEntries,
} from "src/core/ngDsl";

/**
@class NG
@static

使用例:
- ラベル付きハイライト: HighlightTitle(bbs.eddibb.cc/liveedge, label=VTuber): vtuber
- プリセット色使用: HighlightTitle(bbs.eddibb.cc/liveedge, label=VTuber, bgColor=yellow): vtuber
- カラーコード使用: HighlightTitle(bbs.eddibb.cc/liveedge, label=重要, bgColor=#ffcdd2): 速報
- 背景色のみ: HighlightTitle(bbs.eddibb.cc/liveedge, bgColor=blue): 実況

背景色プリセット:
- yellow: 黄色 (警告・注目)
- blue: 青 (情報)
- green: 緑 (成功・OK)
- red: 赤 (重要・緊急)
- purple: 紫 (特別)
- orange: オレンジ (注意)
- pink: ピンク (お気に入り)
- cyan: シアン (クール)
- lime: ライム (軽い注目)
- amber: アンバー (中程度の注意)

※プリセット名またはカラーコード(#rrggbb)が使用可能
*/

export var TYPE = {
  INVALID: "invalid",
  REG_EXP: "RegExp",
  REG_EXP_TITLE: "RegExpTitle",
  REG_EXP_HIGHLIGHT_TITLE: "RegExpHighlightTitle",
  REG_EXP_NAME: "RegExpName",
  REG_EXP_MAIL: "RegExpMail",
  REG_EXP_ID: "RegExpId",
  REG_EXP_SLIP: "RegExpSlip",
  REG_EXP_BODY: "RegExpBody",
  REG_EXP_URL: "RegExpUrl",
  TITLE: "Title",
  HIGHLIGHT_TITLE: "HighlightTitle",
  NAME: "Name",
  MAIL: "Mail",
  ID: "ID",
  SLIP: "Slip",
  BODY: "Body",
  WORD: "Word",
  URL: "Url",
  RES_COUNT: "ResCount",
  AUTO: "Auto",
  AUTO_CHAIN: "Chain",
  AUTO_CHAIN_ID: "ChainID",
  AUTO_CHAIN_SLIP: "ChainSLIP",
  AUTO_NOTHING_ID: "NothingID",
  AUTO_NOTHING_SLIP: "NothingSLIP",
  AUTO_REPEAT_MESSAGE: "RepeatMessage",
  AUTO_FORWARD_LINK: "ForwardLink",
  SIKI_GUARD: "Siki Guard",
};

const _CONFIG_NAME = "ngobj";
const _CONFIG_STRING_NAME = "ngwords";

let _ng = null;
const _ignoreResRegNumber = /^ignoreResNumber:(\d+)(?:-?(\d+))?,(.*)$/;
const _ignoreNgType = /^ignoreNgType:(?:\$\((.*?)\):)?(.*)$/;
const _expireDate = /^expireDate:(\d{4}\/\d{1,2}\/\d{1,2}),(.*)$/;
const _attachName = /^attachName:([^,]*),(.*)$/;
const _expNgWords = /^\$\[(.*?)\]\$:(.*)$/;

//jsonには正規表現のオブジェクトが含めれないので
//それを展開
const _setupReg = function (obj) {
  const _convReg = function ({ type, word }) {
    let reg = null;
    try {
      reg = new RegExp(word, "i");
    } catch (error) {
      container.notification.notify(
        `\
NG機能の正規表現(${type}: ${word})を読み込むのに失敗しました
この行は無効化されます\
`,
        { backgroundColor: "red" },
      );
    }
    return reg;
  };

  for (let n of obj) {
    let convFlag = true;
    if (n.subElements != null) {
      for (let subElement of n.subElements) {
        if (!subElement.type.startsWith(TYPE.REG_EXP)) {
          continue;
        }
        subElement.reg = _convReg(subElement);
        if (!subElement.reg) {
          subElement.type = TYPE.INVALID;
          convFlag = false;
          break;
        }
      }
    }
    if (convFlag && n.type.startsWith(TYPE.REG_EXP)) {
      n.reg = _convReg(n);
      if (!n.reg) {
        convFlag = false;
      }
    }
    if (!convFlag) {
      n.type = TYPE.INVALID;
    }
  }
};

const _normalizeMainKeyword = function (ngWord) {
  const colonIndex = ngWord.indexOf(":");
  if (colonIndex < 0) {
    return ngWord;
  }

  const keyword = normalizeNgDslKeyword(ngWord.slice(0, colonIndex));
  return `${keyword}:${ngWord.slice(colonIndex + 1)}`;
};

const _config = {
  get() {
    return JSON.parse(container.config.get(_CONFIG_NAME));
  },
  set(str) {
    container.config.set(_CONFIG_NAME, JSON.stringify(str));
  },
  getString() {
    return container.config.get(_CONFIG_STRING_NAME);
  },
  setString(str) {
    container.config.set(_CONFIG_STRING_NAME, str);
  },
};

/**
@method get
@return {Object}
*/
export var get = function () {
  if (_ng == null) {
    _ng = new Set(_config.get());
    _setupReg(_ng);
  }
  return _ng;
};

/**
@method parse
@param {String} string
@return {Object}
*/
export var parse = function (string) {
  const ng = new Set();
  if (string === "") {
    return ng;
  }

  // コメント付きJSON5や旧lowercaseキーもここで正規化してから取り込む。
  const json5Rules = tryParseJSON5Rules(string);
  if (json5Rules != null) {
    const internalObjs = convertUserToInternal(json5Rules);
    for (const obj of internalObjs) {
      ng.add(obj);
    }
    return ng;
  }

  var _getNgElement = function (ngWord) {
    let tmp;
    ngWord = ngWord.trim();
    if (ngWord.startsWith("Comment:") || ngWord === "") {
      return null;
    }
    const ngElement = {
      type: "",
      word: "",
      subElements: [],
    };

    // 補完UIでは関数呼び出し風 DSL を扱うため、ここで旧1行記法へ正規化する。
    const functionCall = extractNgDslFunctionCall(ngWord);
    if (functionCall) {
      const { word, scope, params } = parseNgDslArguments(functionCall.argsSource, {
        positionalWord: functionCall.valueSource == null,
      });
      if (scope != null && scope.length > 0) {
        ngElement.scope = {
          value: scope.length === 1 ? scope[0] : scope,
        };
      }
      if (params != null) {
        ngElement.params = params;
      }

      const functionWord = word ?? functionCall.valueSource;
      ngWord =
        functionWord != null && functionWord !== ""
          ? `${functionCall.keyword}:${functionWord}`
          : `${functionCall.keyword}:`;
    }

    // 右クリックメニュー経由などで `id:` 小文字が入るケースを吸収する。
    ngWord = ngWord.replace(/^id:/i, "ID:");
    ngWord = _normalizeMainKeyword(ngWord);

    // キーワードごとのNG処理
    switch (false) {
      case !ngWord.startsWith("RegExp:"):
        ngElement.type = TYPE.REG_EXP;
        ngElement.word = ngWord.substr(7).trim();
        break;
      case !ngWord.startsWith("RegExpTitle:"):
        ngElement.type = TYPE.REG_EXP_TITLE;
        ngElement.word = ngWord.substr(12).trim();
        break;
      case !ngWord.startsWith("RegExpHighlightTitle:"):
        ngElement.type = TYPE.REG_EXP_HIGHLIGHT_TITLE;
        ngElement.word = ngWord.substr(21).trim();
        break;
      case !ngWord.startsWith("RegExpName:"):
        ngElement.type = TYPE.REG_EXP_NAME;
        ngElement.word = ngWord.substr(11).trim();
        break;
      case !ngWord.startsWith("RegExpMail:"):
        ngElement.type = TYPE.REG_EXP_MAIL;
        ngElement.word = ngWord.substr(11).trim();
        break;
      case !ngWord.startsWith("RegExpId:"):
        ngElement.type = TYPE.REG_EXP_ID;
        ngElement.word = ngWord.substr(9).trim();
        break;
      case !ngWord.startsWith("RegExpSlip:"):
        ngElement.type = TYPE.REG_EXP_SLIP;
        ngElement.word = ngWord.substr(11).trim();
        break;
      case !ngWord.startsWith("RegExpBody:"):
        ngElement.type = TYPE.REG_EXP_BODY;
        ngElement.word = ngWord.substr(11).trim();
        break;
      case !ngWord.startsWith("RegExpUrl:"):
        ngElement.type = TYPE.REG_EXP_URL;
        ngElement.word = ngWord.substr(10).trim();
        break;
      case !ngWord.startsWith("Title:"):
        ngElement.type = TYPE.TITLE;
        ngElement.word = normalize(ngWord.substr(6).trim());
        break;
      case !ngWord.startsWith("HighlightTitle:"):
        ngElement.type = TYPE.HIGHLIGHT_TITLE;
        ngElement.word = normalize(ngWord.substr(15).trim());
        break;
      case !ngWord.startsWith("Name:"):
        ngElement.type = TYPE.NAME;
        ngElement.word = normalize(ngWord.substr(5));
        break;
      case !ngWord.startsWith("Mail:"):
        ngElement.type = TYPE.MAIL;
        ngElement.word = normalize(ngWord.substr(5));
        break;
      case !ngWord.startsWith("ID:"):
        ngElement.type = TYPE.ID;
        ngElement.word = ngWord;
        break;
      case !ngWord.startsWith("発信元:"):
        ngElement.type = TYPE.ID;
        ngElement.word = ngWord;
        break;
      case !ngWord.startsWith("Slip:"):
        ngElement.type = TYPE.SLIP;
        ngElement.word = ngWord.substr(5);
        break;
      case !ngWord.startsWith("Body:"):
        ngElement.type = TYPE.BODY;
        ngElement.word = normalize(ngWord.substr(5));
        break;
      case !ngWord.startsWith("Url:"):
        ngElement.type = TYPE.URL;
        ngElement.word = ngWord.substr(4);
        break;
      case !ngWord.startsWith("ResCount:"):
        ngElement.type = TYPE.RES_COUNT;
        ngElement.word = parseInt(ngWord.substr(9));
        break;
      case !ngWord.startsWith("Auto:"):
        ngElement.type = TYPE.AUTO;
        ngElement.word = ngWord.substr(5);
        if (ngElement.word === "") {
          ngElement.word = "*";
        } else if ((tmp = /\$\((.*)\):/.exec(ngElement.word))) {
          if (tmp[1] != null) {
            ngElement.subType = tmp[1].split(",");
          }
        }
        break;
      // AND条件用副要素の切り出し
      case !_expNgWords.test(ngWord):
        var m = _expNgWords.exec(ngWord);
        for (let i = 1; i <= 2; i++) {
          const ele = _getNgElement(m[i]);
          if (!ele) {
            continue;
          }
          if (ngElement.type !== "") {
            const subElement = {
              type: ngElement.type,
              word: ngElement.word,
            };
            ngElement.subElements.push(subElement);
          }
          ngElement.type = ele.type;
          ngElement.word = ele.word;
          if (
            (ele.subElements != null ? ele.subElements.length : undefined) > 0
          ) {
            ngElement.subElements.push(...ele.subElements);
          }
        }
        break;
      default:
        ngElement.type = TYPE.WORD;
        ngElement.word = normalize(ngWord);
    }
    return ngElement;
  };

  const ngStrSplit = splitNgDslEntries(string);
  for (let ngWord of ngStrSplit) {
    ngWord = ngWord.trim();
    // 関係ないプレフィックスは飛ばす
    var m;
    if (ngWord.startsWith("Comment:") || ngWord === "") {
      continue;
    }

    let ngElement = {};

    // DSL変換時に prefix が複数並ぶことがあるため、先頭の装飾は1回で打ち切らず順に剥がす。
    while (true) {
      // 指定したレス番号はNG除外する
      if ((m = ngWord.match(_ignoreResRegNumber)) != null) {
        ngElement = {
          ...ngElement,
          start: m[1],
          finish: m[2],
        };
        ngWord = m[3].trim();
        continue;
      }

      // 例外NgTypeの指定
      if ((m = ngWord.match(_ignoreNgType)) != null) {
        ngElement = {
          ...ngElement,
          exception: true,
          subType: m[1] != null ? m[1].split(",") : undefined,
        };
        ngWord = m[2].trim();
        continue;
      }

      // 有効期限の指定
      if ((m = ngWord.match(_expireDate)) != null) {
        const expire = stringToDate(`${m[1]} 23:59:59`);
        ngElement = {
          ...ngElement,
          expire: expire.valueOf() + 1000,
        };
        ngWord = m[2].trim();
        continue;
      }

      // 名前の付与
      if ((m = ngWord.match(_attachName)) != null) {
        ngElement = {
          ...ngElement,
          name: m[1],
        };
        ngWord = m[2].trim();
        continue;
      }

      break;
    }

    // キーワードごとの取り出し
    const ele = _getNgElement(ngWord);
    if (ele == null) {
      continue;
    }
    ngElement.type = ele.type;
    ngElement.word = ele.word;
    if (ele.subType != null) {
      ngElement.subType = ele.subType;
    }
    if (ele.subElements != null) {
      ngElement.subElements = ele.subElements;
    }
    if (ele.scope != null) {
      ngElement.scope = ele.scope;
    }
    if (ele.params != null) {
      ngElement.params = ele.params;
    }
    // 拡張項目の設定
    if (ngElement.exception == null) {
      ngElement.exception = false;
    }
    if (ngElement.subType != null) {
      for (let i = ngElement.subType.length - 1; i >= 0; i--) {
        const st = ngElement.subType[i];
        ngElement.subType[i] = st.trim();
        if (ngElement.subType[i] === "") {
          ngElement.subType.splice(i, 1);
        }
      }
      if (ngElement.subType.length === 0) {
        ngElement.subType = null;
      }
    }

    if (ngElement.word !== "") {
      ng.add(ngElement);
    }
  }
  return ng;
};

/**
@method set
@param {Object} obj
*/
export var set = function (string) {
  _ng = parse(string);
  _config.set([..._ng]);
  _setupReg(_ng);
};

/**
@method invalidateCache
iframe内からのNG追加後に親ウィンドウ側のキャッシュを無効化し、
共有configから最新のNGリストを再読み込みさせるために使用する。
*/
export var invalidateCache = function () {
  _ng = null;
};

/**
@method add
@param {String} string
*/
export var add = function (string) {
  // _ng が未初期化の場合は get() で初期化する
  // 最初のNG登録時に _ng は null のままなので、明示的に初期化が必要
  get();

  _config.setString(string + "\n" + _config.getString());
  const addNg = parse(string);
  _config.set([..._config.get()].concat([...addNg]));

  _setupReg(addNg);
  for (let ang of addNg) {
    _ng.add(ang);
  }
};

/**
@method _checkWord
@param {Object} ngObj
@param {Object} threadObj/resObj
@private
*/
const _checkWord = function (
  { type, reg, word },
  { all, name, mail, id, slip, mes, title, url, resCount },
) {
  if (
    (type === TYPE.REG_EXP && reg.test(all)) ||
    (type === TYPE.REG_EXP_NAME && reg.test(name)) ||
    (type === TYPE.REG_EXP_MAIL && reg.test(mail)) ||
    (type === TYPE.REG_EXP_ID && id != null && reg.test(id)) ||
    (type === TYPE.REG_EXP_SLIP && slip != null && reg.test(slip)) ||
    (type === TYPE.REG_EXP_BODY && reg.test(mes)) ||
    (type === TYPE.REG_EXP_TITLE && reg.test(title)) ||
    (type === TYPE.REG_EXP_HIGHLIGHT_TITLE && reg.test(title)) ||
    (type === TYPE.REG_EXP_URL && reg.test(url)) ||
    (type === TYPE.TITLE && normalize(title).includes(word)) ||
    (type === TYPE.HIGHLIGHT_TITLE && normalize(title).includes(word)) ||
    (type === TYPE.NAME && normalize(name).includes(word)) ||
    (type === TYPE.MAIL && normalize(mail).includes(word)) ||
    (type === TYPE.ID && (id != null ? id.includes(word) : undefined)) ||
    (type === TYPE.SLIP && (slip != null ? slip.includes(word) : undefined)) ||
    (type === TYPE.BODY && normalize(mes).includes(word)) ||
    (type === TYPE.WORD && normalize(all).includes(word)) ||
    (type === TYPE.URL && url.includes(word)) ||
    (type === TYPE.RES_COUNT && word < resCount)
  ) {
    return type;
  }
  return null;
};

/**
@method _checkScope
@param {Object} ngObj
@param {String} url
@private
*/
const _checkScope = function (ngObj, url) {
  if (!ngObj.scope) {
    return true;
  }

  const { value } = ngObj.scope;
  const scopeValues = Array.isArray(value) ? value : [value];

  if (scopeValues.some((scopeValue) => scopeValue === "*")) {
    return true;
  }

  // URLの形式: http://DOMAIN/test/read.cgi/BOARD/NUM/
  // スコープの形式例:
  // - "bbs.eddibb.cc/liveedge" -> ドメインと板の両方を指定
  // - "bbs.eddibb.cc" -> ドメインのみ指定
  // - "liveedge" -> 板のみ指定

  return scopeValues.some((scopeValue) => {
    if (scopeValue.includes("/")) {
      return url.includes(scopeValue);
    }

    const domainMatch = url.match(/^https?:\/\/([^/]+)/);
    if (domainMatch && domainMatch[1].includes(scopeValue)) {
      return true;
    }

    const boardMatch = url.match(/\/test\/read\.cgi\/([^/]+)/);
    return boardMatch ? boardMatch[1] === scopeValue : false;
  });
};

/**
@method _checkResNum
@param {Object} ngObj
@param {Number} resNum
@private
*/
const _checkResNum = ({ start, finish }, resNum) =>
  start != null &&
  ((finish != null && start <= resNum && resNum <= finish) ||
    parseInt(start) === resNum);

/**
@method isNGBoard
@param {String} threadTitle
@param {String} url
@param {Number} resCount
@param {Boolean} exceptionFlg
@param {String} subType
@return {Object|null}
*/
export var isNGBoard = function (
  threadTitle,
  url,
  resCount,
  exceptionFlg,
  subType = null,
) {
  if (exceptionFlg == null) {
    exceptionFlg = false;
  }
  const threadObj = {
    all: normalize(threadTitle),
    title: threadTitle,
    url,
    resCount,
  };

  const now = Date.now();
  for (let n of get()) {
    if (n.type === TYPE.INVALID || n.type === "" || n.word === "") {
      continue;
    }
    if (
      ![
        TYPE.REG_EXP,
        TYPE.REG_EXP_TITLE,
        TYPE.REG_EXP_HIGHLIGHT_TITLE,
        TYPE.TITLE,
        TYPE.HIGHLIGHT_TITLE,
        TYPE.WORD,
        TYPE.REG_EXP_URL,
        TYPE.URL,
        TYPE.RES_COUNT,
      ].includes(n.type)
    ) {
      continue;
    }
    // スコープのチェック
    if (!_checkScope(n, url)) {
      continue;
    }
    // 有効期限のチェック
    if (n.expire != null && now > n.expire) {
      continue;
    }
    // ignoreNgType用例外フラグのチェック
    if (n.exception !== exceptionFlg) {
      continue;
    }
    // ng-typeのチエック
    if (n.subType != null && subType && !n.subType.includes(subType)) {
      continue;
    }

    // サブ条件のチェック
    if (n.subElements != null) {
      if (
        !n.subElements.every((subElement) => _checkWord(subElement, threadObj))
      ) {
        continue;
      }
    }
    // メイン条件のチェック
    const ngType = _checkWord(n, threadObj);
    if (ngType) {
      return { type: ngType, name: n.name, params: n.params };
    }
  }
  return null;
};

/**
@method isNGThread
@param {Object} res
@param {String} title
@param {String} url
@param {Number} resCount
@param {Boolean} exceptionFlg
@param {String} subType
@return {Object|null}
*/
export var isNGThread = function (
  res,
  title,
  url,
  exceptionFlg,
  subType = null,
) {
  if (exceptionFlg == null) {
    exceptionFlg = false;
  }
  const name = decodeCharReference(res.name);
  const mail = decodeCharReference(res.mail);
  const other = decodeCharReference(res.other);
  const mes = decodeCharReference(res.message);
  const all = name + " " + mail + " " + other + " " + mes;
  const resObj = {
    all,
    name,
    mail,
    id: res.id != null ? res.id : null,
    slip: res.slip != null ? res.slip : null,
    mes,
    title,
    url,
  };

  const now = Date.now();
  for (let n of get()) {
    if (n.type === TYPE.INVALID || n.type === "" || n.word === "") {
      continue;
    }
    // ハイライト用はスキップ
    if ([TYPE.HIGHLIGHT_TITLE, TYPE.REG_EXP_HIGHLIGHT_TITLE].includes(n.type)) {
      continue;
    }
    // スコープのチェック
    if (!_checkScope(n, url)) {
      continue;
    }
    // ignoreResNumber用レス番号のチェック
    if (_checkResNum(n, res.num)) {
      continue;
    }
    // 有効期限のチェック
    if (n.expire != null && now > n.expire) {
      continue;
    }
    // ignoreNgType用例外フラグのチェック
    if (n.exception !== exceptionFlg) {
      continue;
    }
    // ng-typeのチエック
    if (n.subType != null && subType && !n.subType.includes(subType)) {
      continue;
    }

    // サブ条件のチェック
    if (n.subElements != null) {
      if (
        !n.subElements.every((subElement) => _checkWord(subElement, resObj))
      ) {
        continue;
      }
    }
    // メイン条件のチェック
    const ngType = _checkWord(n, resObj);
    if (ngType) {
      return { type: ngType, name: n.name };
    }
  }
  return null;
};

/**
@method isIgnoreResNumForAuto
@param {Number} resNum
@param {String} subType
@return {Boolean}
*/
export var isIgnoreResNumForAuto = function (resNum, subType) {
  if (subType == null) {
    subType = "";
  }
  for (let n of get()) {
    if (n.type !== TYPE.AUTO) {
      continue;
    }
    if (n.subType != null && !n.subType.includes(subType)) {
      continue;
    }
    if (_checkResNum(n, resNum)) {
      return true;
    }
  }
  return false;
};

/**
@method isThreadIgnoreNgType
@param {Object} res
@param {String} threadTitle
@param {String} url
@param {String} ngType
@return {Boolean}
*/
export var isThreadIgnoreNgType = (res, threadTitle, url, ngType) =>
  isNGThread(res, threadTitle, url, true, ngType);

/**
@method execExpire
*/
export var execExpire = function () {
  const configStr = _config.getString();
  let newConfigStr = "";
  let updateFlag = false;

  const ngStrSplit = splitNgDslEntries(configStr);
  const now = Date.now();
  for (let ngWord of ngStrSplit) {
    ngWord = ngWord.trim();
    // 有効期限の確認
    if (_expireDate.test(ngWord)) {
      const m = ngWord.match(_expireDate);
      const expire = stringToDate(m[1] + " 23:59:59");
      if (expire.valueOf() + 1000 < now) {
        updateFlag = true;
        continue;
      }
    }
    if (newConfigStr !== "") {
      newConfigStr += "\n";
    }
    newConfigStr += ngWord;
  }
  // 期限切れデータが存在した場合はNG情報を更新する
  if (updateFlag) {
    _config.setString(newConfigStr);
    _ng = parse(newConfigStr);
    _config.set([..._ng]);
    _setupReg(_ng);
  }
};
