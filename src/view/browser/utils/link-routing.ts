import type { MouseEvent } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UrlHandlingMode = "respect-default-external";
export const RESPECT_DEFAULT_EXTERNAL: UrlHandlingMode =
  "respect-default-external";

export type ResBodyUrlClickHandler = (
  url: string,
  button: 0 | 1,
  mode?: UrlHandlingMode,
) => boolean | void;

export type UrlClickHandler = (
  url: string,
  resImages?: string[],
  button?: 0 | 1,
  mode?: UrlHandlingMode,
) => boolean | void;

export type UrlContextMenuHandler = (
  url: string,
  e: MouseEvent,
  mode?: UrlHandlingMode,
) => boolean | void;

export interface InternalThreadPage {
  type: "thread";
  title: string;
  threadUrl: string;
}

export interface InternalThreadListPage {
  type: "threadList";
  title: string;
  boardUrl: string;
  boardTitle: string;
}

export type InternalBrowserPage = InternalThreadPage | InternalThreadListPage;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPATIBLE_HOST_SUFFIXES = [
  "5ch.io",
  "2ch.sc",
  "2ch.net",
  "open2ch.net",
  "bbspink.com",
  "machi.to",
] as const;

const COMPATIBLE_EXACT_HOSTS = [
  "jbbs.shitaraba.net",
  "jbbs.livedoor.jp",
  "bbs.eddibb.cc",
] as const;

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

const CH_STYLE_THREAD_PATTERN =
  /^\/((?:[\w-]+\/)?test\/read\.cgi\/[\w-]+\/\d+)\/?/;
const CH_STYLE_BOARD_FROM_THREAD_PATTERN =
  /^\/(?:[\w-]+\/)?test\/read\.cgi\/([\w-]+)\/\d+\/?/;
const CH_STYLE_BOARD_PATTERN =
  /^\/(?:subback\/|test\/-\/)?([\w-]+)\/?(?:index\.html)?(?:#.*)?$/;
const MACHI_THREAD_PATTERN = /^\/bbs\/read\.cgi\/([\w-]+)\/(\d+)\/?/;
const MACHI_BOARD_PATTERN = /^\/([\w-]+)\/?(?:#.*)?$/;
const SHITARABA_THREAD_PATTERN =
  /^\/bbs\/read(?:_archive)?\.cgi\/([\w-]+)\/(\d+)\/(\d+)\/?/;
const SHITARABA_STORAGE_PATTERN = /^\/([\w-]+)\/(\d+)\/storage\/(\d+)\.html$/;
const SHITARABA_BOARD_PATTERN = /^\/([\w-]+)\/(\d+)\/?(?:#.*)?$/;
const EDDIBB_THREAD_PATTERN = /^\/(?:test\/read\.cgi\/)?([\w-]+)\/(\d+)\/?/;
const EDDIBB_BOARD_PATTERN = /^\/(?:test\/read\.cgi\/)?([\w-]+)\/?(?:#.*)?$/;
const ITEST_THREAD_PATTERN =
  /^\/(?:[\w-]+\/)?test\/read\.cgi\/([\w-]+)\/(\d+)\/?$/;
const ITEST_BOARD_PATTERN = /^\/(?:[\w-]+\/)?(?:subback\/)?([\w-]+)\/?$/;

// ---------------------------------------------------------------------------
// Host utilities
// ---------------------------------------------------------------------------

function hasHostnameSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function isCompatibleBoardHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    COMPATIBLE_EXACT_HOSTS.some((host) => h === host) ||
    COMPATIBLE_HOST_SUFFIXES.some((suffix) => hasHostnameSuffix(h, suffix))
  );
}

type BoardType = "eddibb" | "shitaraba" | "machi" | "ch-style";

function classifyBoardHost(hostname: string): BoardType | null {
  // 変更理由: ここで全ホストを ch-style 扱いすると、imgur のような外部URLまで
  // 内部遷移対象に誤判定してしまうため、互換ホストだけを明示的に許可する。
  if (hostname === "bbs.eddibb.cc") return "eddibb";
  if (hostname === "jbbs.shitaraba.net") return "shitaraba";
  if (hasHostnameSuffix(hostname, "machi.to")) return "machi";
  if (isCompatibleBoardHost(hostname)) return "ch-style";
  return null;
}

// ---------------------------------------------------------------------------
// URL normalization
// ---------------------------------------------------------------------------

export function resolveAbsoluteUrl(rawUrl: string, baseUrl: string): string {
  try {
    return new window.URL(rawUrl, baseUrl).href;
  } catch {
    return rawUrl;
  }
}

function normalizeHostname(url: URL): void {
  if (url.hostname === "jbbs.livedoor.jp") {
    url.hostname = "jbbs.shitaraba.net";
    return;
  }
  if (hasHostnameSuffix(url.hostname, "2ch.net")) {
    url.hostname = url.hostname.replace(/2ch\.net$/i, "5ch.io");
  }
}

function normalizeItestUrl(url: URL): void {
  const isItestHost =
    url.hostname === "itest.5ch.io" || url.hostname === "itest.bbspink.com";
  if (!isItestHost) return;

  const threadMatch = ITEST_THREAD_PATTERN.exec(url.pathname);
  if (threadMatch) {
    url.pathname = `/test/read.cgi/${threadMatch[1]}/${threadMatch[2]}/`;
    return;
  }

  const boardMatch = ITEST_BOARD_PATTERN.exec(url.pathname);
  if (boardMatch) {
    // 変更理由: iTest の /<prefix>/test/read.cgi/... を board と誤認して
    // /<prefix>/ へ潰れる不具合を防ぐため、板URL判定は完全一致のときだけ許可する。
    url.pathname = `/${boardMatch[1]}/`;
  }
}

/** Parse, normalize, and return a URL object; returns null on failure. */
function normalizeUrl(raw: string): URL | null {
  try {
    const url = new window.URL(raw);
    normalizeHostname(url);
    normalizeItestUrl(url);
    return url;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

function toThreadPage(url: URL): InternalThreadPage {
  return { type: "thread", title: url.href, threadUrl: url.href };
}

function toThreadListPage(url: URL): InternalThreadListPage {
  return {
    type: "threadList",
    title: url.href,
    boardUrl: url.href,
    boardTitle: url.href,
  };
}

// ---------------------------------------------------------------------------
// Board-specific parsers
// ---------------------------------------------------------------------------

function parseChStylePage(url: URL): InternalBrowserPage | null {
  const threadMatch = CH_STYLE_THREAD_PATTERN.exec(url.pathname);
  if (threadMatch) {
    url.pathname = `/${threadMatch[1]}/`;
    return toThreadPage(url);
  }

  const boardMatch = CH_STYLE_BOARD_PATTERN.exec(url.pathname);
  if (boardMatch) {
    url.pathname = `/${boardMatch[1]}/`;
    return toThreadListPage(url);
  }

  return null;
}

function parseMachiPage(url: URL): InternalBrowserPage | null {
  const threadMatch = MACHI_THREAD_PATTERN.exec(url.pathname);
  if (threadMatch) {
    url.pathname = `/bbs/read.cgi/${threadMatch[1]}/${threadMatch[2]}/`;
    return toThreadPage(url);
  }

  const boardMatch = MACHI_BOARD_PATTERN.exec(url.pathname);
  if (boardMatch) {
    url.pathname = `/${boardMatch[1]}/`;
    return toThreadListPage(url);
  }

  return null;
}

function parseShitarabaPage(url: URL): InternalBrowserPage | null {
  const threadMatch = SHITARABA_THREAD_PATTERN.exec(url.pathname);
  if (threadMatch) {
    const action = url.pathname.includes("read_archive")
      ? "read_archive"
      : "read";
    url.pathname = `/bbs/${action}.cgi/${threadMatch[1]}/${threadMatch[2]}/${threadMatch[3]}/`;
    return toThreadPage(url);
  }

  const storageMatch = SHITARABA_STORAGE_PATTERN.exec(url.pathname);
  if (storageMatch) {
    url.pathname = `/bbs/read_archive.cgi/${storageMatch[1]}/${storageMatch[2]}/${storageMatch[3]}/`;
    return toThreadPage(url);
  }

  const boardMatch = SHITARABA_BOARD_PATTERN.exec(url.pathname);
  if (boardMatch) {
    url.pathname = `/${boardMatch[1]}/${boardMatch[2]}/`;
    return toThreadListPage(url);
  }

  return null;
}

function parseEddibbPage(url: URL): InternalBrowserPage | null {
  const threadMatch = EDDIBB_THREAD_PATTERN.exec(url.pathname);
  if (threadMatch?.[2]) {
    url.protocol = "http:";
    url.pathname = `/test/read.cgi/${threadMatch[1]}/${threadMatch[2]}/`;
    return toThreadPage(url);
  }

  const boardMatch = EDDIBB_BOARD_PATTERN.exec(url.pathname);
  if (boardMatch) {
    url.pathname = `/${boardMatch[1]}/`;
    return toThreadListPage(url);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

const BOARD_PARSERS: Record<BoardType, (url: URL) => InternalBrowserPage | null> =
  {
    eddibb: parseEddibbPage,
    shitaraba: parseShitarabaPage,
    machi: parseMachiPage,
    "ch-style": parseChStylePage,
  };

function dispatchParser(url: URL, strict: boolean): InternalBrowserPage | null {
  const boardType = classifyBoardHost(url.hostname);
  if (boardType) {
    return BOARD_PARSERS[boardType](url);
  }

  // 変更理由: /test/read.cgi/<board>/<thread> や /<board>/ 形式は要望により
  // ドメインに依存せず内部スレ/板として扱いたいため、ホスト分類失敗時の
  // フォールバックとして許可する。画像として解釈できるURLの保護は
  // openResolvedUrl 側（toViewerImageUrl チェック）が担う。
  // ただし strict=true（クリック経路）ではこのフォールバックを適用しない。
  if (strict) {
    return null;
  }

  const threadMatch = CH_STYLE_THREAD_PATTERN.exec(url.pathname);
  if (threadMatch) {
    url.pathname = `/${threadMatch[1]}/`;
    return toThreadPage(url);
  }

  const boardMatch = CH_STYLE_BOARD_PATTERN.exec(url.pathname);
  if (boardMatch) {
    url.pathname = `/${boardMatch[1]}/`;
    return toThreadListPage(url);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getBoardUrlFromThreadUrl(threadUrl: string): string {
  const url = normalizeUrl(threadUrl);
  if (!url) return threadUrl;

  const boardType = classifyBoardHost(url.hostname);
  if (!boardType) return threadUrl;

  switch (boardType) {
    case "eddibb": {
      const match = EDDIBB_THREAD_PATTERN.exec(url.pathname);
      if (match?.[2]) return `${url.origin}/${match[1]}/`;
      break;
    }
    case "shitaraba": {
      const threadMatch = SHITARABA_THREAD_PATTERN.exec(url.pathname);
      if (threadMatch) {
        return `${url.origin}/bbs/read.cgi/${threadMatch[1]}/${threadMatch[2]}/`;
      }
      const storageMatch = SHITARABA_STORAGE_PATTERN.exec(url.pathname);
      if (storageMatch) {
        return `${url.origin}/bbs/read.cgi/${storageMatch[1]}/${storageMatch[2]}/`;
      }
      break;
    }
    case "machi": {
      const match = MACHI_THREAD_PATTERN.exec(url.pathname);
      if (match) return `${url.origin}/${match[1]}/`;
      break;
    }
    case "ch-style": {
      const match = CH_STYLE_BOARD_FROM_THREAD_PATTERN.exec(url.pathname);
      if (match) return `${url.origin}/${match[1]}/`;
      break;
    }
  }

  return threadUrl;
}

export function parseInternalBrowserPage(
  absoluteUrl: string,
): InternalBrowserPage | null {
  const url = normalizeUrl(absoluteUrl);
  return url ? dispatchParser(url, false) : null;
}

/**
 * クリック経路専用。互換ホスト以外のURLはスレ/板として扱わない。
 * オムニバー入力には parseInternalBrowserPage（広い許容）を使う。
 */
export function parseInternalBrowserPageStrict(
  absoluteUrl: string,
): InternalBrowserPage | null {
  const url = normalizeUrl(absoluteUrl);
  return url ? dispatchParser(url, true) : null;
}

export function shouldHandleUrlWithApp(
  absoluteUrl: string,
  mode?: UrlHandlingMode,
): boolean {
  if (mode !== RESPECT_DEFAULT_EXTERNAL) return true;
  return parseInternalBrowserPage(absoluteUrl) != null;
}
