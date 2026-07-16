/**
@class ImageReplaceDat
@static
*/

/**
 * ImageViewURLReplace.dat の1行分のエントリ。
 * @typedef {Object} DatEntry
 * @property {string} baseUrl
 * @property {string} replaceUrl
 * @property {string} referrerUrl
 * @property {string} userAgent
 * @property {{ type?: string, pattern?: string, referrerUrl?: string }} [param]
 * @property {RegExp} [baseUrlReg] _setupReg で展開される。正規表現が不正な行では未設定のまま。
 */

/** @type {Set<DatEntry> | null} */
let _dat = null;
const _CONFIG_NAME = "image_replace_dat_obj";
const _CONFIG_STRING_NAME = "image_replace_dat";
const _INVALID_URL = "invalid://invalid";

//jsonには正規表現のオブジェクトが含めれないので
//それを展開
// (モジュール変数 _dat を直接参照すると null の可能性を毎回否定できないため、引数で受け取る)
/** @param {Set<DatEntry>} dat */
const _setupReg = function (dat) {
  for (let d of dat) {
    try {
      d.baseUrlReg = new RegExp(d.baseUrl, "i");
    } catch (error) {
      app.message.send("notify", {
        message: `\
ImageViewURLReplace.datの一致URLの正規表現(${d.baseUrl})を読み込むのに失敗しました
この行は無効化されます\
`,
        background_color: "red",
      });
      d.baseUrl = _INVALID_URL;
    }
  }
};

const _config = {
  get() {
    // 設定未保存時 (null) は従来の JSON.parse(null) と同じく null を返す。
    return JSON.parse(app.config.get(_CONFIG_NAME) ?? "null");
  },
  /** @param {unknown} str */
  set(str) {
    app.config.set(_CONFIG_NAME, JSON.stringify(str));
  },
  getString() {
    return app.config.get(_CONFIG_STRING_NAME);
  },
  /** @param {string} str */
  setString(str) {
    app.config.set(_CONFIG_STRING_NAME, str);
  },
};

/**
@method get
@return {Set<DatEntry>}
*/
export var get = function () {
  if (_dat == null) {
    if (app.config.get(_CONFIG_NAME) === "") {
      // 設定文字列も未保存 (null) の場合は空文字として「エントリなし」で初期化する。
      set(_config.getString() ?? "");
    }
    const dat = new Set(/** @type {DatEntry[]} */ (_config.get()));
    _setupReg(dat);
    _dat = dat;
  }
  return _dat;
};

/**
@method parse
@param {string} string
@return {Set<DatEntry>}
*/
const parse = function (string) {
  /** @type {Set<DatEntry>} */
  const dat = new Set();
  if (string === "") {
    return dat;
  }
  const datStrSplit = string.split("\n");
  for (var d of datStrSplit) {
    if (d === "") {
      continue;
    }
    if (["//", ";", "'"].some((ele) => d.startsWith(ele))) {
      continue;
    }
    const r = d.split("\t");
    if (r[0] == null) {
      continue;
    }
    /** @type {DatEntry} */
    const obj = {
      baseUrl: r[0],
      replaceUrl: r[1] != null ? r[1] : "",
      referrerUrl: r[2] != null ? r[2] : "",
      userAgent: r[5] != null ? r[5] : "",
    };

    if (r[3] != null) {
      obj.param = {};
      const rurl = r[3].split("=")[1];
      if (r[3].includes("$EXTRACT")) {
        obj.param = {
          type: "extract",
          pattern: r[4],
          referrerUrl: rurl != null ? rurl : "",
        };
      } else if (r[4].includes("$COOKIE")) {
        obj.param = {
          type: "cookie",
          referrerUrl: rurl != null ? rurl : "",
        };
      }
    }
    dat.add(obj);
  }
  return dat;
};

/**
@method set
@param {string} string
*/
export var set = function (string) {
  const dat = parse(string);
  _config.set([...dat]);
  _setupReg(dat);
  _dat = dat;
};

/**
 * replace の結果オブジェクト。分岐ごとに詰められるプロパティが異なる。
 * @typedef {Object} ReplaceResult
 * @property {string} [type]
 * @property {string} [text]
 * @property {string} [extract]
 * @property {string} [extractReferrer]
 * @property {string} [pattern]
 * @property {string} [userAgent]
 * @property {string} [cookie]
 * @property {string} [cookieReferrer]
 * @property {string} [referrer]
 */

/**
@method replace
@param {string} string
@return {{ res: ReplaceResult, err?: string }}
*/
export var replace = function (string) {
  const dat = get();
  /** @type {ReplaceResult} */
  const res = {};
  for (let d of dat) {
    // 不正な正規表現の行は baseUrlReg が未設定なので、_INVALID_URL 判定と併せてスキップする。
    if (d.baseUrl === _INVALID_URL || d.baseUrlReg == null) {
      continue;
    }
    if (!d.baseUrlReg.test(string)) {
      continue;
    }
    if (d.replaceUrl === "") {
      return { res, err: "No parsing" };
    }
    if (d.param != null && d.param.type === "extract") {
      res.type = "extract";
      res.text = string.replace(d.baseUrlReg, d.replaceUrl);
      res.extract = string.replace(d.baseUrlReg, d.referrerUrl);
      res.extractReferrer = d.param.referrerUrl;
      res.pattern = d.param.pattern;
      res.userAgent = d.userAgent;
      return { res };
    } else if (d.param != null && d.param.type === "cookie") {
      res.type = "cookie";
      res.text = string.replace(d.baseUrlReg, d.replaceUrl);
      res.cookie = string.replace(d.baseUrlReg, d.referrerUrl);
      res.cookieReferrer = d.param.referrerUrl;
      res.userAgent = d.userAgent;
      return { res };
    } else {
      res.type = "default";
      res.text = string.replace(d.baseUrlReg, d.replaceUrl);
      if (d.referrerUrl !== "" || d.userAgent !== "") {
        res.type = "referrer";
        res.referrer = string.replace(d.baseUrlReg, d.referrerUrl);
        res.userAgent = d.userAgent;
      }
      return { res };
    }
  }
  return { res, err: "Fail noBaseUrlReg" };
};
