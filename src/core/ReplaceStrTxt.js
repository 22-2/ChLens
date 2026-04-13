import { ReplaceStrParser } from "../../packages/ch-lib/src/index";

let _replaceTable = null;
const _CONFIG_NAME = "replace_str_txt_obj";
const _CONFIG_STRING_NAME = "replace_str_txt";

const _config = {
  get() {
    return JSON.parse(app.config.get(_CONFIG_NAME));
  },
  set(str) {
    app.config.set(_CONFIG_NAME, JSON.stringify(str));
  },
  getString() {
    return app.config.get(_CONFIG_STRING_NAME);
  },
  setString(str) {
    app.config.set(_CONFIG_STRING_NAME, str);
  },
};

/**
@method get
@return {Array}
*/
export var get = function () {
  if (_replaceTable == null) {
    // キャッシュされていたJSONから復元
    const stored = _config.get();
    // 互換性のためにパースし直すか、もしくは保存時にパース済みのものを入れる
    // ここでは念の為文字列から再構成するか、保存済みデータにRegExpを当て直す
    // ReplaceStrParser.parse は文字列入力を想定しているので、
    // 起動時は設定文字列からパースするのが確実
    _replaceTable = ReplaceStrParser.parse(_config.getString());
  }
  return _replaceTable;
};

/**
@method set
@param {String} string
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

/*
@method replace
@param {String} url
@param {String} title
@param {Object} res
*/
export var replace = function (url, title, res) {
  return ReplaceStrParser.replace(url, title, res, get());
};
