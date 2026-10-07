// URL正規化に使う共通パターン。
// 変更理由: core と chlib で read.cgi 系の正規表現が分岐すると、
// 同じURLでも解釈がずれて回帰しやすいため定義を1箇所に集約する。

// スレッドパスの骨格。THREAD系とRESNUM系で同じ構造をリテラルとして
// 二重に書くと片方だけ修正されてズレるため、断片を共有して組み立てる。
// ルーティング/API統合後も、既存リンクが受け付けていたハイフン板名とサーバー名を保つ。
const CH_THREAD_PATH = String.raw`(?:[\w-]+/)?test/(?:read\.cgi|-)/[\w-]+/\d+`;
const CH_THREAD_ULA_PATH = String.raw`2ch/[\w-]+/[\w.-]+/\d+`;
const MACHI_THREAD_PATH = String.raw`[\w-]+/\d+`;
const MACHI_READ_PATH = String.raw`bbs/read\.cgi`;
const SHITARABA_READ_SCRIPT = String.raw`read(?:_archive)?\.cgi`;
const SHITARABA_READ_PATH = String.raw`${SHITARABA_READ_SCRIPT}/[\w-]+/\d+/\d+`;

// 同じ読み取りパスを使う判定が別々に変わらないよう、共通部分だけを共有する。
// 断片には捕捉グループを追加せず、呼び出し元が参照する m[1] 以降の意味を保つ。
const CH_STYLE_READ_PATH = String.raw`(?:[\w-]+/)?test/(?:read\.cgi|-)`;
// dat判定は両用途で許容文字・捕捉値・末尾条件が一致し、g/yフラグもないため共有できる。
const CH_DAT_PATTERN = /^\/([\w-]+)\/dat\/(\d+)\.dat\/?$/;

// 短縮形式はeddibb専用ではなくオムニバーの推測にも使うため、構造を共有する。
// 板名の許容文字と末尾条件は入力経路ごとに異なるので、呼び出し側で指定する。
const shortThreadPath = (boardKey: string): string => String.raw`(${boardKey})/(\d+)`;
const CH_SHORT_THREAD_PATH = shortThreadPath(String.raw`[\w-]+`);
const ROUTE_SHORT_THREAD_PATH = shortThreadPath(String.raw`[\w-]+`);

export const PATTERNS = {
  // 2ch系
  CH_THREAD: new RegExp(String.raw`^/(${CH_THREAD_PATH}).*$`),
  // dat直リンクはホストごとの知識を持たず、板名とスレッド番号の骨格だけで判定する。
  // これにより、5ch互換サーバーが独自ドメインを使っていても同じ取得経路へ渡せる。
  CH_DAT: CH_DAT_PATTERN,
  // ULAのTHREADは板・サーバー・スレキーを個別に捕捉する必要があるため断片を使わない
  CH_THREAD_ULA: /^\/2ch\/([\w-]+)\/([\w.-]+)\/(\d+).*$/,
  CH_BOARD: /^\/((?:subback\/|test\/-\/)?[\w-]+\/)$/,
  // pathname + search に対してマッチさせる
  // (itest形式ではレス番が /g?g=NN のようにクエリ側に載るため pathname 単独では捕捉できない)
  CH_RESNUM: new RegExp(String.raw`^/${CH_THREAD_PATH}/(?:i|g\?g=)?(\d+).*$`),
  CH_RESNUM_ULA: new RegExp(String.raw`^/${CH_THREAD_ULA_PATH}/(\d+).*$`),
  CH_TO_BOARD: /^\/(?:[\w-]+\/)?(?:test\/(?:read\.cgi|-)|bbs\/read\.cgi)\/([\w-]+)\/\d+\/$/,

  // まちBBS系
  MACHI_THREAD: new RegExp(String.raw`^/${MACHI_READ_PATH}/(${MACHI_THREAD_PATH}).*$`),
  MACHI_BOARD: /^\/([\w-]+\/)$/,
  MACHI_RESNUM: new RegExp(String.raw`^/${MACHI_READ_PATH}/${MACHI_THREAD_PATH}/(\d+).*$`),

  // したらば系
  SHITARABA_THREAD: new RegExp(String.raw`^/bbs/(${SHITARABA_READ_PATH}).*$`),
  SHITARABA_ARCHIVE: /^\/([\w-]+\/\d+)\/storage\/(\d+)\.html$/,
  SHITARABA_BOARD: /^\/([\w-]+\/\d+\/)$/,
  SHITARABA_RESNUM: new RegExp(String.raw`^/bbs/${SHITARABA_READ_PATH}/(\d+).*$`),
  SHITARABA_TO_BOARD: new RegExp(String.raw`^/bbs/${SHITARABA_READ_SCRIPT}/([\w-]+/\d+)/\d+/$`),

  // 互換掲示板の短縮形式。標準のスレッド形式はCH_THREADで判定する。
  CH_SHORT_THREAD: new RegExp(String.raw`^/${CH_SHORT_THREAD_PATH}.*$`),
  CH_BOARD_KEY: /^\/(?:test\/read\.cgi\/)?([\w-]+)\/?$/,

  // itest系(5chとbbspinkでパス構造は同一なのでパターンを共有する)
  ITEST: /\/(?:(?:[\w-]+\/)?test\/read\.cgi\/([\w-]+)\/(\d+)\/|(?:subback\/)?([\w-]+)(?:\/)?)/,
} as const;

// 内部ブラウザのルーティング(クリック/オムニバー入力をスレ・板ページへ解決)用パターン。
// 変更理由: view 側の link-routing.ts が独自の正規表現を持っていて PATTERNS と
// 二重管理になっていたため、定義をここへ集約する。
// PATTERNS と別定義なのは、ルーティングでは板キー・スレキーを個別に捕捉する必要があるため。
export const ROUTE_PATTERNS = {
  CH_STYLE_THREAD: new RegExp(String.raw`^/(${CH_STYLE_READ_PATH}/[\w-]+/\d+)/?`),
  // test/read.cgi と test/- の双方から板名とスレッドIDを同じ骨格で捕捉する。
  CH_STYLE_THREAD_PARTS: new RegExp(
    String.raw`^/(?:([\w-]+)/)?test/(read\.cgi|-)/([\w-]+)/([\d]+)(?:/\d+)?/?`,
  ),
  // dat直リンクも板・スレッドの構造が明確なため、特定ホストに依存せず内部スレッドへ解決する。
  CH_DAT: CH_DAT_PATTERN,
  CH_STYLE_BOARD_FROM_THREAD: new RegExp(String.raw`^/${CH_STYLE_READ_PATH}/([\w-]+)/\d+/?`),
  CH_STYLE_BOARD: /^\/(?:subback\/|test\/-\/)?([\w-]+)\/?(?:index\.html)?(?:#.*)?$/,
  MACHI_THREAD: new RegExp(String.raw`^/${MACHI_READ_PATH}/([\w-]+)/(\d+)/?`),
  MACHI_BOARD: /^\/([\w-]+)\/?(?:#.*)?$/,
  SHITARABA_THREAD: new RegExp(String.raw`^/bbs/${SHITARABA_READ_SCRIPT}/([\w-]+)/(\d+)/(\d+)/?`),
  SHITARABA_STORAGE: /^\/([\w-]+)\/(\d+)\/storage\/(\d+)\.html$/,
  SHITARABA_BOARD: /^\/([\w-]+)\/(\d+)\/?(?:#.*)?$/,
  CH_SHORT_THREAD: new RegExp(String.raw`^/${ROUTE_SHORT_THREAD_PATH}/?`),
  CH_BOARD_KEY: /^\/(?:test\/read\.cgi\/)?([\w-]+)\/?(?:#.*)?$/,
  // 未知のホストの推測は誤検出を避けるため、表示件数指定以外の末尾を受け付けない。
  OMNIBAR_SHORT_THREAD: new RegExp(String.raw`^/${ROUTE_SHORT_THREAD_PATH}(?:/l\d+)?/?$`, "i"),
  // レス番号付きURLも板・スレッド本体へ正規化できるよう、末尾のレス番号を許容する。
  ITEST_THREAD: /^\/(?:([\w-]+)\/)?test\/read\.cgi\/([\w-]+)\/(\d+)(?:\/(?:i|g\?g=)?\d+)?\/?$/,
  ITEST_SHORT_THREAD: /^\/([\w-]+)\/(\d+)(?:\/(?:i|g\?g=)?\d+)?\/?$/,
  ITEST_BOARD: /^\/(?:[\w-]+\/)?(?:subback\/)?([\w-]+)\/?$/,
} as const;
