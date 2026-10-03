import { HOSTNAME, isArchiveOnlyBoardHost, normalizeBbsHostname } from "./hosts";
import { PATTERNS, ROUTE_PATTERNS } from "./patterns";

export type BBSType = "2ch" | "machi" | "jbbs" | "unknown";
export type ContentType = "thread" | "board" | "unknown";

export interface GuessResult {
  type: ContentType;
  bbsType: BBSType;
}

export class ChURL extends URL {
  private readonly rawUrl: URL;
  private readonly rawHash: string;
  private guessedType: GuessResult = { type: "unknown", bbsType: "unknown" };
  private archive = false;

  constructor(urlInput: string | URL) {
    super(urlInput.toString());
    this.rawUrl = new URL(this.href);
    this.rawHash = this.hash;
    if (this.normalizeUlaUrl()) return;
    // 変更理由: URL文字列全体への文字列置換だと、パスやクエリに "2ch.net" を
    // 含むだけの無関係なURLまで書き換えてしまうため、hostname に限定して正規化する。
    this.url.hostname = normalizeBbsHostname(this.url.hostname);
    // 変更理由: 過去ログ専用ホストは通常のスレッドURLも受け付けるが、
    // そこから板URLを作ると巨大な過去ログsubject.txtを通常一覧として取得しかねない。
    this.archive = isArchiveOnlyBoardHost(this.url.hostname);
    if (this.normalizeItestUrl()) {
      this.archive = isArchiveOnlyBoardHost(this.url.hostname);
      return;
    }
    this.normalizeAndGuessType();
  }

  /** 旧利用箇所の`.url`アクセスとnative URLとしての直接利用を両立する。 */
  get url(): this {
    return this;
  }

  private normalizeUlaUrl(): boolean {
    if (normalizeBbsHostname(this.url.hostname.toLowerCase()) !== HOSTNAME.ULA_5CH) return false;
    this.url.hostname = HOSTNAME.ULA_5CH;
    const match = PATTERNS.CH_THREAD_ULA.exec(this.url.pathname);
    if (!match) return false;

    // ULA形式の識別子は標準スレッドURLへ移してから、通常の取得APIへ渡す。
    this.url.hostname = normalizeBbsHostname(match[2]);
    this.url.pathname = `/test/read.cgi/${match[1]}/${match[3]}/`;
    this.archive = isArchiveOnlyBoardHost(this.url.hostname);
    this.guessedType = { type: "thread", bbsType: "2ch" };
    return true;
  }

  private normalizeItestUrl(): boolean {
    if (!this.isItestHost(this.rawUrl.hostname)) return false;
    const thread = ROUTE_PATTERNS.ITEST_THREAD.exec(this.rawUrl.pathname + this.rawUrl.search);
    const shortThread = thread
      ? null
      : ROUTE_PATTERNS.ITEST_SHORT_THREAD.exec(this.rawUrl.pathname + this.rawUrl.search);
    if (thread || shortThread) {
      const serverPrefix = thread?.[1];
      const boardKey = thread?.[2] ?? shortThread?.[1];
      const threadId = thread?.[3] ?? shortThread?.[2];
      if (!boardKey || !threadId) return false;
      this.url.pathname = `/test/read.cgi/${boardKey}/${threadId}/`;
      this.applyItestServerPrefix(serverPrefix);
      this.guessedType = { type: "thread", bbsType: "2ch" };
      return true;
    }

    const board = ROUTE_PATTERNS.ITEST_BOARD.exec(this.rawUrl.pathname);
    if (!board) return false;
    this.url.pathname = `/${board[1]}/`;
    this.guessedType = { type: "board", bbsType: "2ch" };
    return true;
  }

  private applyItestServerPrefix(serverPrefix?: string): void {
    if (!serverPrefix) return;
    const domain =
      this.rawUrl.hostname.toLowerCase() === HOSTNAME.ITEST_BBSPINK ? "bbspink.com" : "5ch.io";
    this.url.hostname = `${serverPrefix}.${domain}`;
  }

  private isItestHost(hostname: string): boolean {
    const normalized = normalizeBbsHostname(hostname.toLowerCase());
    return normalized === HOSTNAME.ITEST_5CH || normalized === HOSTNAME.ITEST_BBSPINK;
  }

  private normalizeAndGuessType(): void {
    const hostname = this.url.hostname;

    // したらば
    if (hostname === HOSTNAME.NEW_JBBS) {
      if (
        this.tryFixPattern(PATTERNS.SHITARABA_THREAD, (m) => `/bbs/${m[1]}/`, {
          type: "thread",
          bbsType: "jbbs",
        })
      ) {
        this.archive = this.url.pathname.includes("read_archive");
        return;
      }
      if (
        this.tryFixPattern(
          PATTERNS.SHITARABA_ARCHIVE,
          (m) => `/bbs/read_archive.cgi/${m[1]}/${m[2]}/`,
          { type: "thread", bbsType: "jbbs" },
        )
      ) {
        this.archive = true;
        return;
      }
      this.tryFixPattern(PATTERNS.SHITARABA_BOARD, (m) => `/${m[1]}`, {
        type: "board",
        bbsType: "jbbs",
      });
      return;
    }

    // まちBBS
    if (hostname.includes("machi.to")) {
      if (
        this.tryFixPattern(PATTERNS.MACHI_THREAD, (m) => `/bbs/read.cgi/${m[1]}/`, {
          type: "thread",
          bbsType: "machi",
        })
      ) {
        return;
      }
      this.tryFixPattern(PATTERNS.MACHI_BOARD, (m) => `/${m[1]}`, {
        type: "board",
        bbsType: "machi",
      });
      return;
    }

    // datと標準スレッド形式は共通経路で正規化し、ホスト固有のHTTP指定だけを残す。
    if (
      this.tryFixPattern(PATTERNS.CH_DAT, (m) => `/test/read.cgi/${m[1]}/${m[2]}/`, {
        type: "thread",
        bbsType: "2ch",
      }) ||
      this.tryFixPattern(PATTERNS.CH_THREAD, (m) => `/${m[1]}/`, {
        type: "thread",
        bbsType: "2ch",
      })
    ) {
      if (hostname === HOSTNAME.EDDIBB) this.url.protocol = "http:";
      return;
    }

    // 短縮形式を通常ホストへ広げると一般ページを誤認するため、既知ホストに限定する。
    if (hostname === HOSTNAME.EDDIBB) {
      if (
        this.tryFixPattern(PATTERNS.CH_SHORT_THREAD, (m) => `/test/read.cgi/${m[1]}/${m[2]}/`, {
          type: "thread",
          bbsType: "2ch",
        })
      ) {
        this.url.protocol = "http:";
        return;
      }
      // 判定をまとめても旧read.cgi形式の板パスは維持し、末尾スラッシュだけを補う。
      this.tryFixPattern(PATTERNS.CH_BOARD_KEY, (m) => (m[0].endsWith("/") ? m[0] : `${m[0]}/`), {
        type: "board",
        bbsType: "2ch",
      });
      return;
    }

    this.tryFixPattern(PATTERNS.CH_BOARD, (m) => `/${m[1]}`, { type: "board", bbsType: "2ch" });
  }

  private tryFixPattern(
    pattern: RegExp,
    pathBuilder: (match: RegExpExecArray) => string,
    type: GuessResult,
  ): boolean {
    const match = pattern.exec(this.url.pathname);
    if (match) {
      this.url.pathname = pathBuilder(match);
      this.guessedType = type;
      return true;
    }
    return false;
  }

  get type() {
    return this.guessedType.type;
  }
  get bbsType() {
    return this.guessedType.bbsType;
  }
  get isArchive() {
    return this.archive;
  }

  isHttps(): boolean {
    return this.protocol === "https:";
  }

  toggleProtocol(): void {
    this.protocol = this.isHttps() ? "http:" : "https:";
  }

  createProtocolToggled(): ChURL {
    const toggled = new ChURL(this.href);
    toggled.toggleProtocol();
    return toggled;
  }

  getHashParams(): URLSearchParams {
    return this.rawHash ? new URLSearchParams(this.rawHash.slice(1)) : new URLSearchParams();
  }

  setHashParams(data: Record<string, string>): void {
    this.hash = new URLSearchParams(data).toString();
  }

  getTsld(): string {
    const parts = this.url.hostname.split(".");
    const len = parts.length;
    return len >= 2 ? `${parts[len - 2]}.${parts[len - 1]}` : "";
  }

  guessType(): GuessResult {
    return this.guessedType;
  }

  getDatUrl(): string | null {
    if (this.type !== "thread" || this.isItestHost(this.url.hostname)) return null;
    const tmp = new RegExp(
      `^/(?:[\\w-]+/)?(?:test/(?:read\\.cgi|-)|bbs/read(?:_archive)?\\.cgi)/([\\w-]+)/(\\d+)/(?:(\\d+)/)?$`,
    ).exec(this.url.pathname);
    if (!tmp) return null;

    const tsld = this.getTsld();
    if (tsld === "machi.to") {
      return `${this.url.origin}/bbs/offlaw.cgi/${tmp[1]}/${tmp[2]}/`;
    } else if (tsld === "shitaraba.net") {
      if (this.isArchive) {
        return this.url.href;
      } else {
        return `${this.url.origin}/bbs/rawmode.cgi/${tmp[1]}/${tmp[2]}/${tmp[3]}/`;
      }
    } else {
      return `${this.url.origin}/${tmp[1]}/dat/${tmp[2]}.dat`;
    }
  }

  getSubjectUrl(): string | null {
    // 過去ログ専用ホストは通常板のsubject.txt仕様外なので、一覧取得先にしない。
    if (this.type === "unknown" || this.isArchive || this.isItestHost(this.url.hostname))
      return null;
    const boardUrl = this.toBoard();
    const tmp = new RegExp(`^/([\\w-]+)(?:/(\\d+)/|/?)$`).exec(boardUrl.url.pathname);
    if (!tmp) return null;

    const tsld = this.getTsld();
    if (tsld === "machi.to") {
      return `${this.url.origin}/bbs/offlaw.cgi/${tmp[1]}/`;
    } else if (tsld === "shitaraba.net") {
      return `${this.url.protocol}//jbbs.shitaraba.net/${tmp[1]}/${tmp[2]}/subject.txt`;
    } else {
      return `${this.url.origin}/${tmp[1]}/subject.txt`;
    }
  }

  toBoard(): ChURL {
    if (this.type === "board") return this;
    const pattern = this.bbsType === "jbbs" ? PATTERNS.SHITARABA_TO_BOARD : PATTERNS.CH_TO_BOARD;
    const pathname = this.url.pathname.replace(pattern, "/$1/");
    return new ChURL(`${this.url.origin}${pathname}`);
  }

  /** URLが含むレス番号を、入力時のパス・クエリから取り出す。 */
  getResNumber(): string | null {
    if (this.type !== "thread" || this.bbsType === "unknown") return null;
    if (this.isItestHost(this.rawUrl.hostname)) {
      const itestResponseNumber = this.rawUrl.searchParams.get("g");
      if (itestResponseNumber) return itestResponseNumber;
    }

    const pattern =
      this.bbsType === "jbbs"
        ? PATTERNS.SHITARABA_RESNUM
        : this.bbsType === "machi"
          ? PATTERNS.MACHI_RESNUM
          : this.isUlaInput()
            ? PATTERNS.CH_RESNUM_ULA
            : PATTERNS.CH_RESNUM;
    const match = pattern.exec(this.rawUrl.pathname + this.rawUrl.search);
    return match?.[1] ?? null;
  }

  private isUlaInput(): boolean {
    return normalizeBbsHostname(this.rawUrl.hostname.toLowerCase()) === HOSTNAME.ULA_5CH;
  }

  /** URLから掲示板固有の板識別子を取り出す。 */
  getBoardName(): string | null {
    if (this.type === "unknown") return null;
    const boardUrl = this.type === "thread" ? this.toBoard().url : this.url;
    const parts = boardUrl.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    return this.bbsType === "jbbs" ? parts.slice(0, 2).join("/") : (parts[0] ?? null);
  }

  /** URLから元のスレッドIDを取り出す。 */
  getThreadId(): string | null {
    if (this.type !== "thread") return null;
    const path = this.url.pathname;
    const patterns = [
      /^\/bbs\/read(?:_archive)?\.cgi\/[\w-]+\/\d+\/(\d+)\/?$/,
      /^\/bbs\/read\.cgi\/[\w-]+\/(\d+)\/?$/,
      /^(?:\/(?:[\w-]+\/)?test\/(?:read\.cgi|-)\/[\w-]+\/)(\d+)\/?$/,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(path);
      if (match) return match[1] ?? null;
    }
    return null;
  }

  /** 既読状態や履歴で使う、スキームに依存しない同一性キーを返す。 */
  getThreadKey(): string | null {
    if (this.type !== "thread") return null;
    return `${this.url.host.toLowerCase()}${this.url.pathname}`;
  }

  /** 板URLの同一性キーを返す。 */
  getBoardKey(): string | null {
    if (this.type === "unknown") return null;
    const boardUrl = this.type === "thread" ? this.toBoard().url : this.url;
    return `${boardUrl.host.toLowerCase()}${boardUrl.pathname}`;
  }

  /** itest URLを、呼び出し元が保持するbbsmenu対応表で実サーバーへ変換する。 */
  convertFromPhone(
    resolveServerHostname?: (boardKey: string, network: "5ch" | "bbspink") => string | null,
  ): boolean {
    if (!this.isItestHost(this.rawUrl.hostname)) return false;
    const thread = ROUTE_PATTERNS.ITEST_THREAD.exec(this.rawUrl.pathname + this.rawUrl.search);
    const shortThread = thread
      ? null
      : ROUTE_PATTERNS.ITEST_SHORT_THREAD.exec(this.rawUrl.pathname + this.rawUrl.search);
    const board =
      thread || shortThread ? null : ROUTE_PATTERNS.ITEST_BOARD.exec(this.rawUrl.pathname);
    const boardKey = thread?.[2] ?? shortThread?.[1] ?? board?.[1];
    if (!boardKey) return false;

    const serverPrefix = thread?.[1];
    const network =
      this.rawUrl.hostname.toLowerCase() === HOSTNAME.ITEST_BBSPINK ? "bbspink" : "5ch";
    const hostname =
      serverPrefix?.toLowerCase() === "kako"
        ? `${serverPrefix}.${this.rawUrl.hostname.toLowerCase() === HOSTNAME.ITEST_BBSPINK ? "bbspink.com" : "5ch.io"}`
        : (resolveServerHostname?.(boardKey, network) ?? null);
    if (hostname) this.url.hostname = hostname;
    else if (serverPrefix) this.applyItestServerPrefix(serverPrefix);

    const threadId = thread?.[3] ?? shortThread?.[2];
    this.url.pathname = threadId ? `/test/read.cgi/${boardKey}/${threadId}/` : `/${boardKey}/`;
    this.guessedType = { type: threadId ? "thread" : "board", bbsType: "2ch" };
    this.archive = this.url.hostname.toLowerCase().startsWith("kako.");
    return !this.isItestHost(this.url.hostname);
  }
}
