// URL正規化に使う共通パターン。
// 変更理由: core と ch-lib で read.cgi 系の正規表現が分岐すると、
// 同じURLでも解釈がずれて回帰しやすいため定義を1箇所に集約する。

// スレッドパスの骨格。THREAD系とRESNUM系で同じ構造をリテラルとして
// 二重に書くと片方だけ修正されてズレるため、断片を共有して組み立てる。
const CH_THREAD_PATH = String.raw`(?:\w+/)?test/(?:read\.cgi|-)/\w+/\d+`;
const CH_THREAD_ULA_PATH = String.raw`2ch/\w+/[\w.]+/\d+`;
const MACHI_THREAD_PATH = String.raw`\w+/\d+`;
const SHITARABA_READ_PATH = String.raw`read(?:_archive)?\.cgi/\w+/\d+/\d+`;

export const PATTERNS = {
  // 2ch系
  CH_THREAD: new RegExp(String.raw`^/(${CH_THREAD_PATH}).*$`),
  // ULAのTHREADは板・サーバー・スレキーを個別に捕捉する必要があるため断片を使わない
  CH_THREAD_ULA: /^\/2ch\/(\w+)\/([\w.]+)\/(\d+).*$/,
  CH_BOARD: /^\/((?:subback\/|test\/-\/)?\w+\/)$/,
  // pathname + search に対してマッチさせる
  // (itest形式ではレス番が /g?g=NN のようにクエリ側に載るため pathname 単独では捕捉できない)
  CH_RESNUM: new RegExp(String.raw`^/${CH_THREAD_PATH}/(?:i|g\?g=)?(\d+).*$`),
  CH_RESNUM_ULA: new RegExp(String.raw`^/${CH_THREAD_ULA_PATH}/(\d+).*$`),
  CH_TO_BOARD: /^\/(?:test|bbs)\/read\.cgi\/(\w+)\/\d+\/$/,

  // まちBBS系
  MACHI_THREAD: new RegExp(String.raw`^/bbs/read\.cgi/(${MACHI_THREAD_PATH}).*$`),
  MACHI_BOARD: /^\/(\w+\/)$/,
  MACHI_RESNUM: new RegExp(
    String.raw`^/bbs/read\.cgi/${MACHI_THREAD_PATH}/(\d+).*$`,
  ),

  // したらば系
  SHITARABA_THREAD: new RegExp(String.raw`^/bbs/(${SHITARABA_READ_PATH}).*$`),
  SHITARABA_ARCHIVE: /^\/(\w+\/\d+)\/storage\/(\d+)\.html$/,
  SHITARABA_BOARD: /^\/(\w+\/\d+\/)$/,
  SHITARABA_RESNUM: new RegExp(
    String.raw`^/bbs/${SHITARABA_READ_PATH}/(\d+).*$`,
  ),
  SHITARABA_TO_BOARD: /^\/bbs\/read(?:_archive)?\.cgi\/(\w+\/\d+)\/\d+\/$/,

  // eddibb系
  EDDIBB_THREAD: /^\/(\w+)\/(\d+).*$/,
  EDDIBB_THREAD_2: /^\/test\/read\.cgi\/(\w+)\/(\d+).*$/,
  EDDIBB_BOARD: /^\/(\w+)\/?$/,
  EDDIBB_BOARD_2: /^\/test\/read\.cgi\/(\w+)\/?$/,

  // itest系(5chとbbspinkでパス構造は同一なのでパターンを共有する)
  ITEST:
    /\/(?:(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\/|(?:subback\/)?(\w+)(?:\/)?)/,
} as const;
