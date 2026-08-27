import { HOSTNAME, normalizeBbsHostname } from "../url/hosts";
import { PATTERNS } from "../url/patterns";

export type BBSType = "2ch" | "machi" | "jbbs" | "unknown";
export type ContentType = "thread" | "board" | "unknown";

export interface GuessResult {
  type: ContentType;
  bbsType: BBSType;
}

export class ChURL {
  public url: URL;
  private guessedType: GuessResult = { type: "unknown", bbsType: "unknown" };
  private archive = false;

  constructor(urlInput: string | URL) {
    this.url = new URL(urlInput.toString());
    // 変更理由: URL文字列全体への文字列置換だと、パスやクエリに "2ch.net" を
    // 含むだけの無関係なURLまで書き換えてしまうため、hostname に限定して正規化する。
    this.url.hostname = normalizeBbsHostname(this.url.hostname);
    this.normalizeAndGuessType();
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

    // eddibb は /board/threadKey 形式のURLが混在するため、
    // ここで /test/read.cgi/... に正規化して以降の処理を統一する。
    if (hostname === HOSTNAME.EDDIBB) {
      if (
        this.tryFixPattern(PATTERNS.EDDIBB_THREAD_2, (m) => `/test/read.cgi/${m[1]}/${m[2]}/`, {
          type: "thread",
          bbsType: "2ch",
        })
      ) {
        this.url.protocol = "http:";
        return;
      }
      if (
        this.tryFixPattern(PATTERNS.EDDIBB_THREAD, (m) => `/test/read.cgi/${m[1]}/${m[2]}/`, {
          type: "thread",
          bbsType: "2ch",
        })
      ) {
        this.url.protocol = "http:";
        return;
      }
      if (
        this.tryFixPattern(PATTERNS.EDDIBB_BOARD_2, (m) => `/test/read.cgi/${m[1]}/`, {
          type: "board",
          bbsType: "2ch",
        })
      ) {
        return;
      }
      this.tryFixPattern(PATTERNS.EDDIBB_BOARD, (m) => `/${m[1]}/`, {
        type: "board",
        bbsType: "2ch",
      });
      return;
    }

    if (
      this.tryFixPattern(PATTERNS.CH_DAT, (m) => `/test/read.cgi/${m[1]}/${m[2]}/`, {
        type: "thread",
        bbsType: "2ch",
      })
    ) {
      // dat直リンクを既存のスレッドURLへ正規化し、取得URL・板URL・キャッシュキーの
      // 生成処理を新しいドメイン分岐なしで共通化する。
      return;
    }

    // 2ch / 5ch
    if (
      this.tryFixPattern(PATTERNS.CH_THREAD, (m) => `/${m[1]}/`, { type: "thread", bbsType: "2ch" })
    ) {
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

  getTsld(): string {
    const parts = this.url.hostname.split(".");
    const len = parts.length;
    return len >= 2 ? `${parts[len - 2]}.${parts[len - 1]}` : "";
  }

  getDatUrl(): string | null {
    if (this.type !== "thread") return null;
    const tmp = new RegExp(
      `^/(?:test|bbs)/read(?:_archive)?\\.cgi/(\\w+)/(\\d+)/(?:(\\d+)/)?$`,
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
