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
  // dat直リンクはホストごとの知識を持たず、板名とスレッド番号の骨格だけで判定する。
  // これにより、5ch互換サーバーが独自ドメインを使っていても同じ取得経路へ渡せる。
  CH_DAT: /^\/([\w-]+)\/dat\/(\d+)\.dat\/?$/,
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
  MACHI_RESNUM: new RegExp(String.raw`^/bbs/read\.cgi/${MACHI_THREAD_PATH}/(\d+).*$`),

  // したらば系
  SHITARABA_THREAD: new RegExp(String.raw`^/bbs/(${SHITARABA_READ_PATH}).*$`),
  SHITARABA_ARCHIVE: /^\/(\w+\/\d+)\/storage\/(\d+)\.html$/,
  SHITARABA_BOARD: /^\/(\w+\/\d+\/)$/,
  SHITARABA_RESNUM: new RegExp(String.raw`^/bbs/${SHITARABA_READ_PATH}/(\d+).*$`),
  SHITARABA_TO_BOARD: /^\/bbs\/read(?:_archive)?\.cgi\/(\w+\/\d+)\/\d+\/$/,

  // eddibb系
  EDDIBB_THREAD: /^\/(\w+)\/(\d+).*$/,
  EDDIBB_THREAD_2: /^\/test\/read\.cgi\/(\w+)\/(\d+).*$/,
  EDDIBB_BOARD: /^\/(\w+)\/?$/,
  EDDIBB_BOARD_2: /^\/test\/read\.cgi\/(\w+)\/?$/,

  // itest系(5chとbbspinkでパス構造は同一なのでパターンを共有する)
  ITEST: /\/(?:(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\/|(?:subback\/)?(\w+)(?:\/)?)/,
} as const;

// 内部ブラウザのルーティング(クリック/オムニバー入力をスレ・板ページへ解決)用パターン。
// 変更理由: view 側の link-routing.ts が独自の正規表現を持っていて PATTERNS と
// 二重管理になっていたため、定義をここへ集約する。
// PATTERNS と別定義なのは、ルーティングでは板キー・スレキーを個別に捕捉する必要が
// あることと、板キーにハイフンを許容する([\w-])ためで、意図的な差分である。
export const ROUTE_PATTERNS = {
  CH_STYLE_THREAD: /^\/((?:[\w-]+\/)?test\/read\.cgi\/[\w-]+\/\d+)\/?/,
  // dat直リンクも板・スレッドの構造が明確なため、特定ホストに依存せず内部スレッドへ解決する。
  CH_DAT: /^\/([\w-]+)\/dat\/(\d+)\.dat\/?$/,
  CH_STYLE_BOARD_FROM_THREAD: /^\/(?:[\w-]+\/)?test\/read\.cgi\/([\w-]+)\/\d+\/?/,
  CH_STYLE_BOARD: /^\/(?:subback\/|test\/-\/)?([\w-]+)\/?(?:index\.html)?(?:#.*)?$/,
  MACHI_THREAD: /^\/bbs\/read\.cgi\/([\w-]+)\/(\d+)\/?/,
  MACHI_BOARD: /^\/([\w-]+)\/?(?:#.*)?$/,
  SHITARABA_THREAD: /^\/bbs\/read(?:_archive)?\.cgi\/([\w-]+)\/(\d+)\/(\d+)\/?/,
  SHITARABA_STORAGE: /^\/([\w-]+)\/(\d+)\/storage\/(\d+)\.html$/,
  SHITARABA_BOARD: /^\/([\w-]+)\/(\d+)\/?(?:#.*)?$/,
  EDDIBB_THREAD: /^\/(?:test\/read\.cgi\/)?([\w-]+)\/(\d+)\/?/,
  EDDIBB_BOARD: /^\/(?:test\/read\.cgi\/)?([\w-]+)\/?(?:#.*)?$/,
  ITEST_THREAD: /^\/(?:[\w-]+\/)?test\/read\.cgi\/([\w-]+)\/(\d+)\/?$/,
  ITEST_BOARD: /^\/(?:[\w-]+\/)?(?:subback\/)?([\w-]+)\/?$/,
} as const;
