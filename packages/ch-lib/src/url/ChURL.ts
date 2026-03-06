export type BBSType = "2ch" | "machi" | "jbbs" | "unknown";
export type ContentType = "thread" | "board" | "unknown";

export interface GuessResult {
  type: ContentType;
  bbsType: BBSType;
}

const HOSTNAME = {
  OLD_2CH: "2ch.net",
  NEW_5CH: "5ch.net",
  OLD_JBBS: "jbbs.livedoor.jp",
  NEW_JBBS: "jbbs.shitaraba.net",
  ULA_5CH: "ula.5ch.net",
  EDDIBB: "bbs.eddibb.cc",
  ITEST_5CH: "itest.5ch.net",
  ITEST_BBSPINK: "itest.bbspink.com",
} as const;

const PATTERNS = {
  // 2ch系
  CH_THREAD: /^\/((?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+).*$/,
  CH_THREAD_ULA: /^\/2ch\/(\w+)\/([\w\.]+)\/(\d+).*$/,
  CH_BOARD: /^\/((?:subback\/|test\/-\/)?\w+\/)(?:#.*)?$/,
  CH_RESNUM: /^https?:\/\/[\w\.]+\/(?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+\/(?:i|g\?g=)?(\d+).*$/,
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
} as const;

export class ChURL {
  public url: URL;
  private guessedType: GuessResult = { type: "unknown", bbsType: "unknown" };
  private archive = false;

  constructor(urlInput: string | URL) {
    // Basic normalization of hostname
    let normalized = urlInput.toString();
    if (normalized.includes(HOSTNAME.OLD_2CH)) {
      normalized = normalized.replace(HOSTNAME.OLD_2CH, HOSTNAME.NEW_5CH);
    } else if (normalized.includes(HOSTNAME.OLD_JBBS)) {
      normalized = normalized.replace(HOSTNAME.OLD_JBBS, HOSTNAME.NEW_JBBS);
    }

    this.url = new URL(normalized);
    this.normalizeAndGuessType();
  }

  private normalizeAndGuessType(): void {
    const hostname = this.url.hostname;
    const pathname = this.url.pathname;

    // したらば
    if (hostname === HOSTNAME.NEW_JBBS) {
      if (this.tryFixPattern(PATTERNS.SHITARABA_THREAD, (m) => `/bbs/${m[1]}/`, { type: "thread", bbsType: "jbbs" })) {
        this.archive = this.url.pathname.includes("read_archive");
        return;
      }
      if (this.tryFixPattern(PATTERNS.SHITARABA_ARCHIVE, (m) => `/bbs/read_archive.cgi/${m[1]}/${m[2]}/`, { type: "thread", bbsType: "jbbs" })) {
        this.archive = true;
        return;
      }
      this.tryFixPattern(PATTERNS.SHITARABA_BOARD, (m) => `/${m[1]}`, { type: "board", bbsType: "jbbs" });
      return;
    }

    // まちBBS
    if (hostname.includes("machi.to")) {
      if (this.tryFixPattern(PATTERNS.MACHI_THREAD, (m) => `/bbs/read.cgi/${m[1]}/`, { type: "thread", bbsType: "machi" })) {
        return;
      }
      this.tryFixPattern(PATTERNS.MACHI_BOARD, (m) => `/${m[1]}`, { type: "board", bbsType: "machi" });
      return;
    }

    // 2ch / 5ch
    if (this.tryFixPattern(PATTERNS.CH_THREAD, (m) => `/${m[1]}/`, { type: "thread", bbsType: "2ch" })) {
      return;
    }
    this.tryFixPattern(PATTERNS.CH_BOARD, (m) => `/${m[1]}`, { type: "board", bbsType: "2ch" });
  }

  private tryFixPattern(pattern: RegExp, pathBuilder: (match: RegExpExecArray) => string, type: GuessResult): boolean {
    const match = pattern.exec(this.url.pathname);
    if (match) {
      this.url.pathname = pathBuilder(match);
      this.guessedType = type;
      return true;
    }
    return false;
  }

  get type() { return this.guessedType.type; }
  get bbsType() { return this.guessedType.bbsType; }
  get isArchive() { return this.archive; }

  getTsld(): string {
    const parts = this.url.hostname.split(".");
    const len = parts.length;
    return len >= 2 ? `${parts[len - 2]}.${parts[len - 1]}` : "";
  }

  getDatUrl(): string | null {
    if (this.type !== "thread") return null;
    const tmp = new RegExp(`^/(?:test|bbs)/read(?:_archive)?\\.cgi/(\\w+)/(\\d+)/(?:(\\d+)/)?$`).exec(this.url.pathname);
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
    if (this.type === "unknown") return null;
    const boardUrl = this.toBoard();
    const tmp = new RegExp(`^/(\\w+)(?:/(\\d+)/|/?)$`).exec(boardUrl.url.pathname);
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
}
