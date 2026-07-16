import {
  ChURL,
  HOSTNAME,
  normalizeBbsHostname,
  PATTERNS,
  TSLD,
  type BBSType,
  type ContentType,
  type GuessResult,
} from "packages/ch-lib/src/index";
import { Request } from "src/core/HTTP";
import { fetch as fetchBBSMenu } from "src/core/BBSMenu.js";
import Cache from "src/core/Cache.js";

let serverNet = new Map<string, string>();
let serverSc = new Map<string, string>();
let serverPink = new Map<string, string>();

export class URL extends window.URL {
  private guessedType: GuessResult = { type: "unknown", bbsType: "unknown" };
  private tsld: string | null = null;
  private readonly rawUrl: string;
  private readonly rawHash: string;
  private archive = false;

  constructor(url: string) {
    super(url);
    this.rawUrl = url;
    this.rawHash = this.hash;
    this.hash = "";
    this.normalizeAndGuessType();
  }

  // メインの正規化処理
  // 変更理由: 正規化・種別推定のロジックが ChURL と丸ごと重複していたため、
  // ChURL に委譲する。ULA 形式だけは ChURL 未対応のためこのクラスで処理する。
  private normalizeAndGuessType(): void {
    if (this.hostname === HOSTNAME.ULA_5CH) {
      this.fixUla5ch();
      return;
    }

    const ch = new ChURL(this.href);
    this.href = ch.url.href;
    this.guessedType = { type: ch.type, bbsType: ch.bbsType };
    this.archive = ch.isArchive;
  }

  // ULA 5ch の修正
  private fixUla5ch(): void {
    const match = PATTERNS.CH_THREAD_ULA.exec(this.pathname);
    if (match) {
      // 変更理由: ULAパスから取り出したホスト名(egg.5ch.net 等)も移転マップで
      // 正規化しないと、委譲先の ChURL(getDatUrl 等)と origin の解釈がずれる。
      this.hostname = normalizeBbsHostname(match[2]);
      this.pathname = `/test/read.cgi/${match[1]}/${match[3]}/`;
      this.guessedType = { type: "thread", bbsType: "2ch" };
    }
  }

  // レス番号の取得
  getResNumber(): string | null {
    const { type, bbsType } = this.guessedType;

    if (type !== "thread" || bbsType === "unknown") {
      return null;
    }

    const raw = new window.URL(this.rawUrl);

    const patternMap: Record<BBSType, RegExp | null> = {
      jbbs: PATTERNS.SHITARABA_RESNUM,
      machi: PATTERNS.MACHI_RESNUM,
      "2ch": raw.hostname === HOSTNAME.ULA_5CH ? PATTERNS.CH_RESNUM_ULA : PATTERNS.CH_RESNUM,
      unknown: null,
    };

    const pattern = patternMap[bbsType];
    if (!pattern) return null;

    // itest形式ではレス番が ?g= クエリに載るため pathname に search を連結して照合する
    const match = pattern.exec(raw.pathname + raw.search);
    return match ? match[1] : null;
  }

  /**
   * datのURLを取得
   * 変更理由: ChURL に同一実装があるため委譲する。
   * (このインスタンスの href は正規化済みなので再パースは冪等)
   */
  getDatUrl(): string | null {
    if (this.guessedType.type !== "thread") return null;
    return new ChURL(this.href).getDatUrl();
  }

  // スレッドURLから板URLへ変換
  // 変更理由: パターン置換の実体は ChURL.toBoard と同一のため委譲する。
  // 非スレッドURLで例外を投げる従来の契約はこちらで維持する。
  toBoard(): URL {
    if (this.guessedType.type !== "thread") {
      throw new Error("toBoard()はThreadでのみ呼び出せます");
    }
    return new URL(new ChURL(this.href).toBoard().url.href);
  }

  // 携帯版URLからの変換
  convertFromPhone(): void {
    const tsld = this.getTsld();

    if (this.hostname !== HOSTNAME.ITEST_5CH && this.hostname !== HOSTNAME.ITEST_BBSPINK) {
      return;
    }

    const match = PATTERNS.ITEST.exec(this.pathname);
    if (!match) return;

    const board = match[1] || match[3];
    const thread = match[2] || null;
    if (!board) return;

    const server = this.findServer(board, tsld);
    if (!server.serverName) return;

    this.hostname = `${server.serverName}.${server.domain}`;
    this.pathname = thread ? `/test/read.cgi/${board}/${thread}/` : `/${board}/`;
    this.guessedType = {
      type: thread ? "thread" : "board",
      bbsType: "2ch",
    };
  }

  // サーバー検索
  private findServer(board: string, tsld: string): { serverName: string | null; domain: string } {
    if (tsld === TSLD.CH_5) {
      if (serverNet.has(board)) {
        return { serverName: serverNet.get(board)!, domain: TSLD.CH_5 };
      }
      if (serverPink.has(board)) {
        return { serverName: serverPink.get(board)!, domain: TSLD.BBSPINK };
      }
    } else if (tsld === TSLD.BBSPINK && serverPink.has(board)) {
      return { serverName: serverPink.get(board)!, domain: TSLD.BBSPINK };
    }
    return { serverName: null, domain: tsld };
  }

  // .net ⇔ .sc 変換
  private async exchangeNetSc(): Promise<void> {
    const { type } = this.guessedType;
    const boardKey = this.extractBoardKey(type);
    if (!boardKey) return;

    const tsld = this.getTsld();

    // キャッシュから変換を試みる
    if (await this.tryExchangeFromCache(boardKey, tsld)) {
      return;
    }

    // 5ch.io以外はスキップ
    if (tsld !== TSLD.CH_5) return;

    // HTTPリクエストで変換先を取得
    await this.fetchAndExchangeNetSc(boardKey, type);
  }

  private extractBoardKey(type: ContentType): string | null {
    const splits = this.pathname.split("/");

    if (type === "thread" && splits.length > 3) {
      return splits[3];
    } else if (type === "board" && splits.length > 1) {
      return splits[1];
    }
    return null;
  }

  private async tryExchangeFromCache(boardKey: string, tsld: string): Promise<boolean> {
    if (tsld === TSLD.CH_5 && serverSc.has(boardKey)) {
      const server = serverSc.get(boardKey)!;
      this.hostname = `${server}.${TSLD.CH_2_SC}`;
      return true;
    } else if (serverNet.has(boardKey)) {
      const server = serverNet.get(boardKey)!;
      this.hostname = `${server}.${TSLD.CH_5}`;
      return true;
    }
    return false;
  }

  private async fetchAndExchangeNetSc(boardKey: string, type: ContentType): Promise<void> {
    const hostname = this.hostname.replace(`.${TSLD.CH_5}`, `.${TSLD.CH_2_SC}`);
    const req = new Request("HEAD", `http://${hostname}${this.pathname}`);
    const { status, responseURL: resUrlStr } = await req.send();

    if (status >= 400) {
      throw new Error("移動先情報の取得の通信に失敗しました");
    }

    const resUrl = new URL(resUrlStr);
    const server = resUrl.hostname.split(".")[0];
    const newBoardKey = this.extractBoardKeyFromUrl(resUrl, type);

    if (newBoardKey && !serverSc.has(newBoardKey)) {
      serverSc.set(newBoardKey, server);
    }

    this.hostname = resUrl.hostname;
  }

  private extractBoardKeyFromUrl(url: URL, type: ContentType): string | null {
    const splits = url.pathname.split("/");

    if (type === "thread" && splits.length > 3) {
      return splits[3];
    } else if (type === "board" && splits.length > 1) {
      return splits[1];
    }
    return null;
  }

  // 公開メソッド
  guessType(): GuessResult {
    return this.guessedType;
  }

  isArchive(): boolean {
    return this.archive;
  }

  getTsld(): string {
    if (this.tsld === null) {
      const parts = this.hostname.split(".");
      const len = parts.length;
      this.tsld = len >= 2 ? `${parts[len - 2]}.${parts[len - 1]}` : "";
    }
    return this.tsld;
  }

  isHttps(): boolean {
    return this.protocol === "https:";
  }

  toggleProtocol(): void {
    this.protocol = this.isHttps() ? "http:" : "https:";
  }

  createProtocolToggled(): URL {
    const toggled = new URL(this.href);
    toggled.toggleProtocol();
    return toggled;
  }

  getHashParams(): URLSearchParams {
    return this.rawHash ? new URLSearchParams(this.rawHash.slice(1)) : new URLSearchParams();
  }

  setHashParams(data: Record<string, string>): void {
    this.hash = new URLSearchParams(data).toString();
  }

  async createNetScConverted(): Promise<URL> {
    const newUrl = new URL(this.href);
    await newUrl.exchangeNetSc();
    return newUrl;
  }
}

export function fix(urlStr: string): string {
  return new URL(urlStr).href;
}

export function tsld(urlStr: string): string {
  return new URL(urlStr).getTsld();
}

export function getDomain(urlStr: string): string {
  return new URL(urlStr).hostname;
}

export function getProtocol(urlStr: string): string {
  return new URL(urlStr).protocol;
}

export function isHttps(urlStr: string): boolean {
  return getProtocol(urlStr) === "https:";
}

export function setProtocol(urlStr: string, protocol: string): string {
  const url = new URL(urlStr);
  url.protocol = protocol;
  return url.href;
}

export function getResNumber(urlStr: string): string | null {
  return new URL(urlStr).getResNumber();
}

export function threadToBoard(urlStr: string): string {
  return new URL(urlStr).toBoard().href;
}

export function parseQuery(urlStr: string, fromSearch = true): URLSearchParams {
  if (fromSearch) {
    return new URLSearchParams(urlStr.slice(1));
  }
  return new window.URL(urlStr).searchParams;
}

export function buildQuery(data: Record<string, string>): string {
  return new URLSearchParams(data).toString();
}

export const SHORT_URL_LIST: ReadonlySet<string> = new Set([
  "amba.to",
  "amzn.to",
  "bit.ly",
  "buff.ly",
  "cas.st",
  "cos.lv",
  "dlvr.it",
  "ekaz10.xyz",
  "fb.me",
  "g.co",
  "goo.gl",
  "htn.to",
  "ift.tt",
  "is.gd",
  "itun.es",
  "j.mp",
  "jump.cx",
  "kkbox.fm",
  "morimo2.info",
  "ow.ly",
  "p.tl",
  "prt.nu",
  "redd.it",
  "snipurl.com",
  "spoti.fi",
  "t.co",
  "tiny.cc",
  "tinyurl.com",
  "tl.gd",
  "tr.im",
  "trib.al",
  "qq4q.biz",
  "u0u1.net",
  "ur0.biz",
  "ur0.work",
  "url.ie",
  "urx.nu",
  "urx.red",
  "urx2.nu",
  "urx3.nu",
  "ur0.pw",
  "ur2.link",
  "ustre.am",
  "ux.nu",
  "wb2.biz",
  "wk.tk",
  "xrl.us",
  "y2u.be",
]);

export async function expandShortURL(shortUrl: string): Promise<string> {
  let finalUrl = "";
  const cache = new Cache(shortUrl);

  const res = await (async () => {
    try {
      await cache.get();
      return { data: cache.data, url: null };
    } catch {
      const req = new Request("HEAD", shortUrl, {
        timeout: parseInt(app.config.get("expand_short_url_timeout")!),
      });

      let { status, responseURL: resUrl } = await req.send();

      if (shortUrl === resUrl && status >= 400) {
        return { data: null, url: null };
      }
      // 無限ループの防止
      if (resUrl === shortUrl) {
        return { data: null, url: null };
      }

      // 取得したURLが短縮URLだった場合は再帰呼出しする
      if (SHORT_URL_LIST.has(getDomain(resUrl))) {
        resUrl = await expandShortURL(resUrl);
        return { data: null, url: resUrl };
      }
      return { data: null, url: resUrl };
    }
  })();

  if (res.data === null && res.url !== null) {
    cache.lastUpdated = Date.now();
    cache.data = res.url;
    void cache.put();
    finalUrl = res.url;
  } else if (res.data !== null && res.url === null) {
    finalUrl = res.data;
  }
  return finalUrl;
}

const AUDIO_REG = /\.(?:mp3|m4a|wav|oga|spx)(?:[?#:&].*)?$/;
const VIDEO_REG = /\.(?:mp4|m4v|webm|ogv)(?:[?#:&].*)?$/;
const OGG_REG = /\.(?:ogg|ogx)(?:[?#:&].*)?$/;
export function getExtType(
  filename: string,
  {
    audio = true,
    video = true,
    oggIsAudio = false,
    oggIsVideo = true,
  }: Partial<{
    audio: boolean;
    video: boolean;
    oggIsAudio: boolean;
    oggIsVideo: boolean;
  }> = {},
): "audio" | "video" | null {
  if (audio && AUDIO_REG.test(filename)) {
    return "audio";
  }
  if (video && VIDEO_REG.test(filename)) {
    return "video";
  }
  if (video && oggIsVideo && OGG_REG.test(filename)) {
    return "video";
  }
  if (audio && oggIsAudio && OGG_REG.test(filename)) {
    return "audio";
  }
  return null;
}

interface ResInfo {
  net: boolean;
  sc: boolean;
  bbspink: boolean;
}

// BBSMenu.js(型なしJS)から渡される生メニューの実際のアクセス形状。
// 変更理由: any型の使用を避けるため、参照している最小限のフィールドだけを型付けする。
interface RawBbsMenuBoard {
  url: string;
}
interface RawBbsMenuCategory {
  board: RawBbsMenuBoard[];
}

function applyServerInfo(menu: RawBbsMenuCategory[]): ResInfo {
  const boardNet = new Map<string, string>();
  const boardSc = new Map<string, string>();
  const boardPink = new Map<string, string>();
  const res: ResInfo = {
    net: serverNet.size > 0,
    sc: serverSc.size > 0,
    bbspink: serverPink.size > 0,
  };

  if (res.net && res.sc && res.bbspink) return res;

  for (const category of menu) {
    for (const board of category.board) {
      let tmp: string[] | null;

      if (!res.net && (tmp = /https?:\/\/(\w+)\.5ch\.net\/(\w+)\/.*?/.exec(board.url)) !== null) {
        boardNet.set(tmp[2], tmp[1]);
      } else if (
        !res.sc &&
        (tmp = /https?:\/\/(\w+)\.2ch\.sc\/(\w+)\/.*?/.exec(board.url)) !== null
      ) {
        boardSc.set(tmp[2], tmp[1]);
      } else if (
        !res.bbspink &&
        (tmp = /https?:\/\/(\w+)\.bbspink\.com\/(\w+)\/.*?/.exec(board.url)) !== null
      ) {
        boardPink.set(tmp[2], tmp[1]);
      }
    }
  }

  if (boardNet.size > 0) serverNet = boardNet;
  if (boardSc.size > 0) serverSc = boardSc;
  if (boardPink.size > 0) serverPink = boardPink;

  return {
    net: serverNet.size > 0,
    sc: serverSc.size > 0,
    bbspink: serverPink.size > 0,
  };
}

export async function pushServerInfo(menu: RawBbsMenuCategory[]) {
  const res = applyServerInfo(menu);

  if (res.net && res.sc && res.bbspink) {
    return;
  }

  if (!res.net || !res.bbspink) {
    const tmpUrl = `https://menu.5ch.io/bbsmenu.html`;
    const tmpMenu = (await fetchBBSMenu(tmpUrl, false)).menu as RawBbsMenuCategory[];
    applyServerInfo(tmpMenu);
  }
  if (!res.sc) {
    const tmpUrl = `https://menu.2ch.sc/bbsmenu.html`;
    const tmpMenu = (await fetchBBSMenu(tmpUrl, false)).menu as RawBbsMenuCategory[];
    applyServerInfo(tmpMenu);
  }
}
