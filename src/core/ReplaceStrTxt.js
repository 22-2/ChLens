import { ReplaceStrParser } from "packages/ch-lib/src/index";

/** @type {import("packages/ch-lib/src/index").ReplaceStrRule[] | null} */
let _replaceTable = null;
const _CONFIG_NAME = "replace_str_txt_obj";
const _CONFIG_STRING_NAME = "replace_str_txt";

const _config = {
  get() {
    // 設定未保存時 (null) は JSON.parse に空オブジェクト文字列を与えるのと同じ挙動にする。
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
@return {import("packages/ch-lib/src/index").ReplaceStrRule[]}
*/
export var get = function () {
  if (_replaceTable == null) {
    // 互換性のためにパースし直すか、もしくは保存時にパース済みのものを入れる
    // ここでは念の為文字列から再構成するか、保存済みデータにRegExpを当て直す
    // ReplaceStrParser.parse は文字列入力を想定しているので、
    // 起動時は設定文字列からパースするのが確実
    // (設定未保存時は null が返るため、空文字として「ルールなし」にパースさせる)
    _replaceTable = ReplaceStrParser.parse(_config.getString() ?? "");
  }
  return _replaceTable;
};

/**
@method set
@param {string} string
*/
export var set = function (string) {
  _replaceTable = ReplaceStrParser.parse(string);
  _config.set(
    _replaceTable.map((r) => {
      const { beforeReg, ...rest } = r;
      return rest;
    }),
  );
  _config.setString(string);
};

/**
@method replace
@param {string} url
@param {string} title
@param {import("packages/ch-lib/src/index").ReplaceStrTarget} res
*/
export var replace = function (url, title, res) {
  return ReplaceStrParser.replace(url, title, res, get());
};
