import type { MouseEvent } from "react";

import {
  classifyBoardHost,
  HOSTNAME,
  normalizeBbsHostname,
  ROUTE_PATTERNS,
  type BoardHostType,
} from "packages/ch-lib/src/index";
import { resolveItestServerHostname } from "src/view/browser/utils/itest-server-map";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UrlHandlingMode = "respect-default-external";
export const RESPECT_DEFAULT_EXTERNAL: UrlHandlingMode = "respect-default-external";

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
// URL normalization
// ---------------------------------------------------------------------------
// 変更理由: 互換ホスト判定・移転マップ・ルーティング用正規表現は ch-lib の
// hosts.ts / patterns.ts に集約した。このファイルには view 固有のポリシー
// (strict/オムニバーの許容差、itest サーバー解決)だけを残す。

export function resolveAbsoluteUrl(rawUrl: string, baseUrl: string): string {
  try {
    return new window.URL(rawUrl, baseUrl).href;
  } catch {
    return rawUrl;
  }
}

function normalizeItestUrl(url: URL): void {
  const isItestHost =
    url.hostname === HOSTNAME.ITEST_5CH || url.hostname === HOSTNAME.ITEST_BBSPINK;
  if (!isItestHost) return;

  const threadMatch = ROUTE_PATTERNS.ITEST_THREAD.exec(url.pathname);
  if (threadMatch) {
    url.pathname = `/test/read.cgi/${threadMatch[1]}/${threadMatch[2]}/`;
    convertItestHostname(url, threadMatch[1]);
    return;
  }

  const boardMatch = ROUTE_PATTERNS.ITEST_BOARD.exec(url.pathname);
  if (boardMatch) {
    // 変更理由: iTest の /<prefix>/test/read.cgi/... を board と誤認して
    // /<prefix>/ へ潰れる不具合を防ぐため、板URL判定は完全一致のときだけ許可する。
    url.pathname = `/${boardMatch[1]}/`;
    convertItestHostname(url, boardMatch[1]);
  }
}

function convertItestHostname(url: URL, boardKey: string): void {
  // 変更理由: itest ホストのままでは dat/subject.txt を取得できないため、
  // bbsmenu 由来の対応表で実サーバー（例: mercury.bbspink.com）へ変換する。
  // 対応表に無い板は変換せず残す（従来どおり読み込み失敗となるが誤変換よりまし）。
  const hostname = resolveItestServerHostname(boardKey);
  if (hostname) {
    url.hostname = hostname;
  }
}

/** Parse, normalize, and return a URL object; returns null on failure. */
function normalizeUrl(raw: string): URL | null {
  try {
    const url = new window.URL(raw);
    url.hostname = normalizeBbsHostname(url.hostname);
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

function parseChDatPage(url: URL): InternalThreadPage | null {
  const datMatch = ROUTE_PATTERNS.CH_DAT.exec(url.pathname);
  if (!datMatch) return null;

  // dat直リンクは板名と数値のスレッド番号が揃うため、独自ドメインを列挙せずに
  // 既存のスレッド画面へ正規化できる。ChURL側でも同じ正規化を行う。
  url.pathname = `/test/read.cgi/${datMatch[1]}/${datMatch[2]}/`;
  return toThreadPage(url);
}

// ---------------------------------------------------------------------------
// Board-specific parsers
// ---------------------------------------------------------------------------

function parseChStylePage(url: URL): InternalBrowserPage | null {
  const datPage = parseChDatPage(url);
  if (datPage) return datPage;

  const threadMatch = ROUTE_PATTERNS.CH_STYLE_THREAD.exec(url.pathname);
  if (threadMatch) {
    url.pathname = `/${threadMatch[1]}/`;
    return toThreadPage(url);
  }

  const boardMatch = ROUTE_PATTERNS.CH_STYLE_BOARD.exec(url.pathname);
  if (boardMatch) {
    url.pathname = `/${boardMatch[1]}/`;
    return toThreadListPage(url);
  }

  return null;
}

function parseMachiPage(url: URL): InternalBrowserPage | null {
  const threadMatch = ROUTE_PATTERNS.MACHI_THREAD.exec(url.pathname);
  if (threadMatch) {
    url.pathname = `/bbs/read.cgi/${threadMatch[1]}/${threadMatch[2]}/`;
    return toThreadPage(url);
  }

  const boardMatch = ROUTE_PATTERNS.MACHI_BOARD.exec(url.pathname);
  if (boardMatch) {
    url.pathname = `/${boardMatch[1]}/`;
    return toThreadListPage(url);
  }

  return null;
}

function parseShitarabaPage(url: URL): InternalBrowserPage | null {
  const threadMatch = ROUTE_PATTERNS.SHITARABA_THREAD.exec(url.pathname);
  if (threadMatch) {
    const action = url.pathname.includes("read_archive") ? "read_archive" : "read";
    url.pathname = `/bbs/${action}.cgi/${threadMatch[1]}/${threadMatch[2]}/${threadMatch[3]}/`;
    return toThreadPage(url);
  }

  const storageMatch = ROUTE_PATTERNS.SHITARABA_STORAGE.exec(url.pathname);
  if (storageMatch) {
    url.pathname = `/bbs/read_archive.cgi/${storageMatch[1]}/${storageMatch[2]}/${storageMatch[3]}/`;
    return toThreadPage(url);
  }

  const boardMatch = ROUTE_PATTERNS.SHITARABA_BOARD.exec(url.pathname);
  if (boardMatch) {
    url.pathname = `/${boardMatch[1]}/${boardMatch[2]}/`;
    return toThreadListPage(url);
  }

  return null;
}

function parseEddibbPage(url: URL): InternalBrowserPage | null {
  const threadMatch = ROUTE_PATTERNS.EDDIBB_THREAD.exec(url.pathname);
  if (threadMatch?.[2]) {
    url.protocol = "http:";
    url.pathname = `/test/read.cgi/${threadMatch[1]}/${threadMatch[2]}/`;
    return toThreadPage(url);
  }

  const boardMatch = ROUTE_PATTERNS.EDDIBB_BOARD.exec(url.pathname);
  if (boardMatch) {
    url.pathname = `/${boardMatch[1]}/`;
    return toThreadListPage(url);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

const BOARD_PARSERS: Record<BoardHostType, (url: URL) => InternalBrowserPage | null> = {
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

  const datPage = parseChDatPage(url);
  if (datPage) return datPage;

  // 変更理由: /test/read.cgi/<board>/<thread> 形式は 5ch互換掲示板特有の
  // パスで誤爆の恐れがないため、ドメインに依存せず（クリック経路の
  // strict=true でも）内部スレッドとして扱う。
  const threadMatch = ROUTE_PATTERNS.CH_STYLE_THREAD.exec(url.pathname);
  if (threadMatch) {
    url.pathname = `/${threadMatch[1]}/`;
    return toThreadPage(url);
  }

  // 変更理由: /<board>/ 形式は imgur のような一般URLとも一致してしまうため、
  // strict=true（クリック経路）ではフォールバックを適用しない。
  // オムニバー入力（strict=false）でのみ板として許可する。
  if (strict) {
    return null;
  }

  const boardMatch = ROUTE_PATTERNS.CH_STYLE_BOARD.exec(url.pathname);
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

  const datMatch = ROUTE_PATTERNS.CH_DAT.exec(url.pathname);
  if (datMatch) return `${url.origin}/${datMatch[1]}/`;

  const genericThreadMatch = ROUTE_PATTERNS.CH_STYLE_BOARD_FROM_THREAD.exec(url.pathname);
  if (genericThreadMatch) {
    // 変更理由: 板ホストを既知一覧に登録していない互換サーバーでも、オムニバーから
    // スレを開いた際に「戻る先」として正しい板URLを生成し、スレURLそのものを
    // threadListとして誤って積まないようにする。
    return `${url.origin}/${genericThreadMatch[1]}/`;
  }

  const boardType = classifyBoardHost(url.hostname);
  if (!boardType) return threadUrl;

  switch (boardType) {
    case "eddibb": {
      const match = ROUTE_PATTERNS.EDDIBB_THREAD.exec(url.pathname);
      if (match?.[2]) return `${url.origin}/${match[1]}/`;
      break;
    }
    case "shitaraba": {
      const threadMatch = ROUTE_PATTERNS.SHITARABA_THREAD.exec(url.pathname);
      if (threadMatch) {
        return `${url.origin}/bbs/read.cgi/${threadMatch[1]}/${threadMatch[2]}/`;
      }
      const storageMatch = ROUTE_PATTERNS.SHITARABA_STORAGE.exec(url.pathname);
      if (storageMatch) {
        return `${url.origin}/bbs/read.cgi/${storageMatch[1]}/${storageMatch[2]}/`;
      }
      break;
    }
    case "machi": {
      const match = ROUTE_PATTERNS.MACHI_THREAD.exec(url.pathname);
      if (match) return `${url.origin}/${match[1]}/`;
      break;
    }
    case "ch-style": {
      const match = ROUTE_PATTERNS.CH_STYLE_BOARD_FROM_THREAD.exec(url.pathname);
      if (match) return `${url.origin}/${match[1]}/`;
      break;
    }
  }

  return threadUrl;
}

export function parseInternalBrowserPage(absoluteUrl: string): InternalBrowserPage | null {
  const url = normalizeUrl(absoluteUrl);
  return url ? dispatchParser(url, false) : null;
}

/**
 * クリック経路専用。互換ホスト以外のURLはスレ/板として扱わない。
 * オムニバー入力には parseInternalBrowserPage（広い許容）を使う。
 */
export function parseInternalBrowserPageStrict(absoluteUrl: string): InternalBrowserPage | null {
  const url = normalizeUrl(absoluteUrl);
  return url ? dispatchParser(url, true) : null;
}

export function shouldHandleUrlWithApp(absoluteUrl: string, mode?: UrlHandlingMode): boolean {
  if (mode !== RESPECT_DEFAULT_EXTERNAL) return true;
  return parseInternalBrowserPage(absoluteUrl) != null;
}
