// URL正規化に使う共通パターン。
// 変更理由: core と ch-lib で read.cgi 系の正規表現が分岐すると、
// 同じURLでも解釈がずれて回帰しやすいため定義を1箇所に集約する。
export const PATTERNS = {
  // 2ch系
  CH_THREAD: /^\/((?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+).*$/,
  CH_THREAD_ULA: /^\/2ch\/(\w+)\/([\w\.]+)\/(\d+).*$/,
  CH_BOARD: /^\/((?:subback\/|test\/-\/)?\w+\/)(?:#.*)?$/,
  CH_RESNUM:
    /^https?:\/\/[\w\.]+\/(?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+\/(?:i|g\?g=)?(\d+).*$/,
  CH_RESNUM_ULA: /^\/2ch\/\w+\/[\w\.]+\/\d+\/(\d+).*$/,
  CH_TO_BOARD: /^\/(?:test|bbs)\/read\.cgi\/(\w+)\/\d+\/$/,

  // まちBBS系
  MACHI_THREAD: /^\/bbs\/read\.cgi\/(\w+\/\d+).*$/,
  MACHI_BOARD: /^\/(\w+\/)(?:#.*)?$/,
  MACHI_RESNUM: /^\/bbs\/read\.cgi\/\w+\/\d+\/(\d+).*$/,

  // したらば系
  SHITARABA_THREAD: /^\/bbs\/(read(?:_archive)?\.cgi\/\w+\/\d+\/\d+).*$/,
  SHITARABA_ARCHIVE: /^\/(\w+\/\d+)\/storage\/(\d+)\.html$/,
  SHITARABA_BOARD: /^\/(\w+\/\d+\/)(?:#.*)?$/,
  SHITARABA_RESNUM: /^\/bbs\/read(?:_archive)?\.cgi\/\w+\/\d+\/\d+\/(\d+).*$/,
  SHITARABA_TO_BOARD: /^\/bbs\/read(?:_archive)?\.cgi\/(\w+\/\d+)\/\d+\/$/,

  // eddibb系
  EDDIBB_THREAD: /^\/(\w+)\/(\d+).*$/,
  EDDIBB_THREAD_2: /^\/test\/read\.cgi\/(\w+)\/(\d+).*$/,
  EDDIBB_BOARD: /^\/(\w+)\/?(?:#.*)?$/,
  EDDIBB_BOARD_2: /^\/test\/read\.cgi\/(\w+)\/?(?:#.*)?$/,

  // itest系
  ITEST_5CH:
    /\/(?:(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\/|(?:subback\/)?(\w+)(?:\/)?)/,
  ITEST_BBSPINK:
    /\/(?:(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\/|(?:subback\/)?(\w+)(?:\/)?)/,
} as const;
