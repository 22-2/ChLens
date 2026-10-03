import { type BBSType, ChURL } from "./ChURL";
import { classifyBoardHost, HOSTNAME, normalizeBbsHostname } from "./hosts";
import { ROUTE_PATTERNS } from "./patterns";

export type BoardUrlMode = "strict" | "browse" | "guess";

export interface ResolveBoardUrlOptions {
  /** クリック、通常ブラウズ、入力欄の推測を呼び出し側が選ぶ。 */
  mode?: BoardUrlMode;
  /** itest の板キーから、bbsmenu等で得た取得先ホストを返す。 */
  resolveServerHostname?: (boardKey: string, network: "5ch" | "bbspink") => string | null;
}

export interface ResolvedThreadUrl {
  type: "thread";
  /** 表示と遷移に使う正規化済みURL。 */
  url: string;
  threadUrl: string;
  boardUrl: string;
  /** スキーム・検索文字列・フラグメントを除いた同一性キー。 */
  threadKey: string;
  boardKey: string;
  /** URL内の板識別子。したらばでは directory/board 番号を含む。 */
  boardName: string;
  /** URLに含まれる元のスレッドID。数値以外の場合もある。 */
  threadId: string;
  resNumber: string | null;
  bbsType: BBSType;
  isArchive: boolean;
}

export interface ResolvedBoardUrl {
  type: "board";
  url: string;
  boardUrl: string;
  boardKey: string;
  boardName: string;
  bbsType: BBSType;
}

export type BoardUrlResolution = ResolvedThreadUrl | ResolvedBoardUrl;

interface ParsedRoute {
  type: "thread" | "board";
  bbsType: BBSType;
  threadId?: string;
  boardPath?: string;
  boardName?: string;
  isArchive?: boolean;
}

function identityKey(input: string): string {
  const url = new URL(input);
  return `${url.host.toLowerCase()}${url.pathname}`;
}

function normalizeItestUrl(
  url: URL,
  resolveServerHostname?: (boardKey: string, network: "5ch" | "bbspink") => string | null,
): void {
  const isItestHost =
    url.hostname === HOSTNAME.ITEST_5CH || url.hostname === HOSTNAME.ITEST_BBSPINK;
  if (!isItestHost) return;
  const network = url.hostname === HOSTNAME.ITEST_BBSPINK ? "bbspink" : "5ch";

  const threadMatch = ROUTE_PATTERNS.ITEST_THREAD.exec(url.pathname + url.search);
  const shortThreadMatch = threadMatch
    ? null
    : ROUTE_PATTERNS.ITEST_SHORT_THREAD.exec(url.pathname + url.search);
  if (threadMatch || shortThreadMatch) {
    const serverPrefix = threadMatch?.[1];
    const boardKey = threadMatch?.[2] ?? shortThreadMatch?.[1];
    const threadId = threadMatch?.[3] ?? shortThreadMatch?.[2];
    if (!boardKey || !threadId) return;
    url.pathname = `/test/read.cgi/${boardKey}/${threadId}/`;
    convertItestHostname(url, boardKey, serverPrefix, resolveServerHostname, network);
    return;
  }

  const boardMatch = ROUTE_PATTERNS.ITEST_BOARD.exec(url.pathname);
  if (boardMatch) {
    // itest のread.cgiを板と誤認しないよう、完全一致した板形式だけ変換する。
    url.pathname = `/${boardMatch[1]}/`;
    convertItestHostname(url, boardMatch[1], undefined, resolveServerHostname, network);
  }
}

function convertItestHostname(
  url: URL,
  boardKey: string,
  serverPrefix?: string,
  resolveServerHostname?: (boardKey: string, network: "5ch" | "bbspink") => string | null,
  network: "5ch" | "bbspink" = url.hostname === HOSTNAME.ITEST_BBSPINK ? "bbspink" : "5ch",
): void {
  const domain = url.hostname === HOSTNAME.ITEST_BBSPINK ? "bbspink.com" : HOSTNAME.NEW_5CH;

  // 過去ログホストは通常板の対応表より優先する。
  if (serverPrefix?.toLowerCase() === "kako") {
    url.hostname = `kako.${domain}`;
    return;
  }

  const hostname = resolveServerHostname?.(boardKey, network);
  if (hostname) {
    url.hostname = hostname;
    return;
  }

  // 対応表を復元できない場合も、URL中のサーバー名は取得先として利用できる。
  if (serverPrefix) url.hostname = `${serverPrefix}.${domain}`;
}

function normalizeUrl(
  rawUrl: string,
  resolveServerHostname?: (boardKey: string, network: "5ch" | "bbspink") => string | null,
): URL | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (normalizeBbsHostname(url.hostname.toLowerCase()) === HOSTNAME.ULA_5CH) {
    url.hostname = normalizeBbsHostname(url.hostname.toLowerCase());
    const ula = new ChURL(url.href);
    if (ula.type === "thread") url.href = ula.href;
  }
  url.hostname = normalizeBbsHostname(url.hostname.toLowerCase());
  // 注入された解決関数の不具合は呼び出し元へ伝え、URL入力エラーと区別する。
  normalizeItestUrl(url, resolveServerHostname);
  return url;
}

function parseChThread(url: URL): ParsedRoute | null {
  const datMatch = ROUTE_PATTERNS.CH_DAT.exec(url.pathname);
  if (datMatch) {
    url.pathname = `/test/read.cgi/${datMatch[1]}/${datMatch[2]}/`;
    return {
      type: "thread",
      bbsType: "2ch",
      threadId: datMatch[2],
      boardPath: `/${datMatch[1]}/`,
      boardName: datMatch[1],
    };
  }

  const threadMatch = ROUTE_PATTERNS.CH_STYLE_THREAD_PARTS.exec(url.pathname);
  if (threadMatch) {
    const [, serverPrefix, endpoint, boardName, threadId] = threadMatch;
    url.pathname = `/${serverPrefix ? `${serverPrefix}/` : ""}test/${endpoint}/${boardName}/${threadId}/`;
    return {
      type: "thread",
      bbsType: "2ch",
      threadId,
      boardPath: `/${boardName}/`,
      boardName,
    };
  }

  return null;
}

function parseKnownBoardRoute(url: URL): ParsedRoute | null {
  const hostType = classifyBoardHost(url.hostname);
  if (!hostType) return null;

  if (hostType === "eddibb") {
    const thread = parseChThread(url);
    if (thread) {
      url.protocol = "http:";
      return thread;
    }

    const shortThread = ROUTE_PATTERNS.CH_SHORT_THREAD.exec(url.pathname);
    if (shortThread?.[2]) {
      url.pathname = `/test/read.cgi/${shortThread[1]}/${shortThread[2]}/`;
      url.protocol = "http:";
      return {
        type: "thread",
        bbsType: "2ch",
        threadId: shortThread[2],
        boardPath: `/${shortThread[1]}/`,
        boardName: shortThread[1],
      };
    }

    const board = ROUTE_PATTERNS.CH_BOARD_KEY.exec(url.pathname);
    if (board) {
      url.pathname = `/${board[1]}/`;
      return { type: "board", bbsType: "2ch", boardPath: url.pathname, boardName: board[1] };
    }
    return null;
  }

  if (hostType === "shitaraba") {
    const thread = ROUTE_PATTERNS.SHITARABA_THREAD.exec(url.pathname);
    if (thread) {
      const action = url.pathname.includes("read_archive") ? "read_archive" : "read";
      url.pathname = `/bbs/${action}.cgi/${thread[1]}/${thread[2]}/${thread[3]}/`;
      return {
        type: "thread",
        bbsType: "jbbs",
        threadId: thread[3],
        boardPath: `/${thread[1]}/${thread[2]}/`,
        boardName: `${thread[1]}/${thread[2]}`,
        isArchive: action === "read_archive",
      };
    }

    const storage = ROUTE_PATTERNS.SHITARABA_STORAGE.exec(url.pathname);
    if (storage) {
      url.pathname = `/bbs/read_archive.cgi/${storage[1]}/${storage[2]}/${storage[3]}/`;
      return {
        type: "thread",
        bbsType: "jbbs",
        threadId: storage[3],
        boardPath: `/${storage[1]}/${storage[2]}/`,
        boardName: `${storage[1]}/${storage[2]}`,
        isArchive: true,
      };
    }

    const board = ROUTE_PATTERNS.SHITARABA_BOARD.exec(url.pathname);
    if (board) {
      url.pathname = `/${board[1]}/${board[2]}/`;
      return {
        type: "board",
        bbsType: "jbbs",
        boardPath: url.pathname,
        boardName: `${board[1]}/${board[2]}`,
      };
    }
    return null;
  }

  if (hostType === "machi") {
    const thread = ROUTE_PATTERNS.MACHI_THREAD.exec(url.pathname);
    if (thread) {
      url.pathname = `/bbs/read.cgi/${thread[1]}/${thread[2]}/`;
      return {
        type: "thread",
        bbsType: "machi",
        threadId: thread[2],
        boardPath: `/${thread[1]}/`,
        boardName: thread[1],
      };
    }

    const board = ROUTE_PATTERNS.MACHI_BOARD.exec(url.pathname);
    if (board) {
      url.pathname = `/${board[1]}/`;
      return { type: "board", bbsType: "machi", boardPath: url.pathname, boardName: board[1] };
    }
    return null;
  }

  const thread = parseChThread(url);
  if (thread) return thread;

  const board = ROUTE_PATTERNS.CH_STYLE_BOARD.exec(url.pathname);
  if (board) {
    url.pathname = `/${board[1]}/`;
    return { type: "board", bbsType: "2ch", boardPath: url.pathname, boardName: board[1] };
  }
  return null;
}

function parseRoute(url: URL, mode: BoardUrlMode): ParsedRoute | null {
  const knownRoute = parseKnownBoardRoute(url);
  if (knownRoute) return knownRoute;

  // read.cgiとdatはスレッド形式が明確なので、未知ホストでもstrictで扱う。
  const thread = parseChThread(url);
  if (thread) return thread;

  if (mode === "strict" || classifyBoardHost(url.hostname)) return null;

  if (mode === "guess") {
    const shortThread = ROUTE_PATTERNS.OMNIBAR_SHORT_THREAD.exec(url.pathname);
    if (shortThread) {
      url.pathname = `/test/read.cgi/${shortThread[1]}/${shortThread[2]}/`;
      return {
        type: "thread",
        bbsType: "2ch",
        threadId: shortThread[2],
        boardPath: `/${shortThread[1]}/`,
        boardName: shortThread[1],
      };
    }
  }

  const board = ROUTE_PATTERNS.CH_STYLE_BOARD.exec(url.pathname);
  if (board) {
    url.pathname = `/${board[1]}/`;
    return { type: "board", bbsType: "2ch", boardPath: url.pathname, boardName: board[1] };
  }
  return null;
}

function responseNumber(rawUrl: string, bbsType: BBSType): string | null {
  try {
    const route = new ChURL(rawUrl);
    if (bbsType === "unknown" || route.type !== "thread") return null;
    return route.getResNumber();
  } catch {
    return null;
  }
}

/** URL形式の違いを隠し、掲示板・板・スレッドの意味情報へ解決する。 */
export function resolveBoardUrl(
  rawUrl: string,
  options: ResolveBoardUrlOptions = {},
): BoardUrlResolution | null {
  const mode = options.mode ?? "browse";
  const url = normalizeUrl(rawUrl, options.resolveServerHostname);
  if (!url) return null;

  const route = parseRoute(url, mode);
  if (!route) return null;

  if (route.type === "board") {
    const board = new URL(url.href);
    board.pathname = route.boardPath ?? url.pathname;
    const boardUrl = board.href;
    return {
      type: "board",
      url: boardUrl,
      boardUrl,
      boardKey: identityKey(boardUrl),
      boardName: route.boardName ?? "",
      bbsType: route.bbsType,
    };
  }

  const threadUrl = url.href;
  const board = new URL(threadUrl);
  board.pathname = route.boardPath ?? url.pathname;
  board.search = "";
  board.hash = "";
  const boardUrl = board.href;
  let isArchive = route.isArchive ?? false;
  try {
    const canonical = new ChURL(threadUrl);
    isArchive ||= canonical.isArchive;
  } catch {
    // route parserが作成したboardPathを使うため、別のパーサーの失敗に依存しない。
  }

  return {
    type: "thread",
    url: threadUrl,
    threadUrl,
    boardUrl,
    threadKey: identityKey(threadUrl),
    boardKey: identityKey(boardUrl),
    boardName: route.boardName ?? "",
    threadId: route.threadId ?? "",
    resNumber: responseNumber(rawUrl, route.bbsType),
    bbsType: route.bbsType,
    isArchive,
  };
}

/** スレッドURLから板URLを導出する。従来のルーティング用APIと同じパスを保つ。 */
export function getBoardUrlFromThreadUrl(
  threadUrl: string,
  options: Pick<ResolveBoardUrlOptions, "resolveServerHostname"> = {},
): string {
  const parsedUrl = normalizeUrl(threadUrl, options.resolveServerHostname);
  if (!parsedUrl) return threadUrl;

  const datMatch = ROUTE_PATTERNS.CH_DAT.exec(parsedUrl.pathname);
  if (datMatch) return `${parsedUrl.origin}/${datMatch[1]}/`;

  const genericThread = ROUTE_PATTERNS.CH_STYLE_THREAD_PARTS.exec(parsedUrl.pathname);
  if (genericThread) return `${parsedUrl.origin}/${genericThread[3]}/`;

  const hostType = classifyBoardHost(parsedUrl.hostname);
  if (hostType === "eddibb") {
    const match = ROUTE_PATTERNS.CH_SHORT_THREAD.exec(parsedUrl.pathname);
    if (match?.[2]) return `${parsedUrl.origin}/${match[1]}/`;
  } else if (hostType === "shitaraba") {
    const match = ROUTE_PATTERNS.SHITARABA_THREAD.exec(parsedUrl.pathname);
    if (match) return `${parsedUrl.origin}/bbs/read.cgi/${match[1]}/${match[2]}/`;
    const storage = ROUTE_PATTERNS.SHITARABA_STORAGE.exec(parsedUrl.pathname);
    if (storage) return `${parsedUrl.origin}/bbs/read.cgi/${storage[1]}/${storage[2]}/`;
  } else if (hostType === "machi") {
    const match = ROUTE_PATTERNS.MACHI_THREAD.exec(parsedUrl.pathname);
    if (match) return `${parsedUrl.origin}/${match[1]}/`;
  }

  return threadUrl;
}
