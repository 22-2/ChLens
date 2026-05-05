import type { MouseEvent } from "react";

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
  /^\/(?:test\/read\.cgi\/([\w-]+)\/(\d+)\/|(?:subback\/)?([\w-]+)\/?)/;

function hasHostnameSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function isCompatibleBoardHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return (
    COMPATIBLE_EXACT_HOSTS.some(
      (candidate) => normalizedHostname === candidate,
    ) ||
    COMPATIBLE_HOST_SUFFIXES.some((suffix) =>
      hasHostnameSuffix(normalizedHostname, suffix),
    )
  );
}

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

function isItestHost(hostname: string): boolean {
  return hostname === "itest.5ch.io" || hostname === "itest.bbspink.com";
}

function normalizeItestUrl(url: URL): void {
  if (!isItestHost(url.hostname)) {
    return;
  }

  const match = ITEST_THREAD_PATTERN.exec(url.pathname);
  if (!match) {
    return;
  }

  const board = match[1] || match[3];
  const threadId = match[2] ?? null;
  if (!board) {
    return;
  }

  url.pathname = threadId
    ? `/test/read.cgi/${board}/${threadId}/`
    : `/${board}/`;
}

function toThreadPage(url: URL): InternalThreadPage {
  return {
    type: "thread",
    title: url.href,
    threadUrl: url.href,
  };
}

function toThreadListPage(url: URL): InternalThreadListPage {
  return {
    type: "threadList",
    title: url.href,
    boardUrl: url.href,
    boardTitle: url.href,
  };
}

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
  if (threadMatch && threadMatch[2]) {
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

export function getBoardUrlFromThreadUrl(threadUrl: string): string {
  try {
    const normalizedUrl = new window.URL(threadUrl);
    normalizeHostname(normalizedUrl);
    normalizeItestUrl(normalizedUrl);

    if (!isCompatibleBoardHost(normalizedUrl.hostname)) {
      return threadUrl;
    }

    if (normalizedUrl.hostname === "bbs.eddibb.cc") {
      const threadMatch = EDDIBB_THREAD_PATTERN.exec(normalizedUrl.pathname);
      if (threadMatch && threadMatch[2]) {
        return `${normalizedUrl.origin}/${threadMatch[1]}/`;
      }
      return threadUrl;
    }

    if (normalizedUrl.hostname === "jbbs.shitaraba.net") {
      const threadMatch = SHITARABA_THREAD_PATTERN.exec(normalizedUrl.pathname);
      if (threadMatch) {
        return `${normalizedUrl.origin}/bbs/read.cgi/${threadMatch[1]}/${threadMatch[2]}/`;
      }

      const storageMatch = SHITARABA_STORAGE_PATTERN.exec(normalizedUrl.pathname);
      if (storageMatch) {
        return `${normalizedUrl.origin}/bbs/read.cgi/${storageMatch[1]}/${storageMatch[2]}/`;
      }

      return threadUrl;
    }

    if (hasHostnameSuffix(normalizedUrl.hostname, "machi.to")) {
      const threadMatch = MACHI_THREAD_PATTERN.exec(normalizedUrl.pathname);
      if (threadMatch) {
        return `${normalizedUrl.origin}/${threadMatch[1]}/`;
      }
      return threadUrl;
    }

    const chThreadMatch = CH_STYLE_BOARD_FROM_THREAD_PATTERN.exec(
      normalizedUrl.pathname,
    );
    if (chThreadMatch) {
      return `${normalizedUrl.origin}/${chThreadMatch[1]}/`;
    }
  } catch {
    return threadUrl;
  }

  return threadUrl;
}

export function parseInternalBrowserPage(
  absoluteUrl: string,
): InternalBrowserPage | null {
  try {
    const normalizedUrl = new window.URL(absoluteUrl);
    normalizeHostname(normalizedUrl);
    normalizeItestUrl(normalizedUrl);

    // path だけで判定すると https://example.com/software/ のような外部URLまで
    // 板URL扱いになるため、まず対応ホストかどうかを厳密に絞る。
    if (!isCompatibleBoardHost(normalizedUrl.hostname)) {
      return null;
    }

    if (normalizedUrl.hostname === "bbs.eddibb.cc") {
      return parseEddibbPage(normalizedUrl);
    }

    if (normalizedUrl.hostname === "jbbs.shitaraba.net") {
      return parseShitarabaPage(normalizedUrl);
    }

    if (hasHostnameSuffix(normalizedUrl.hostname, "machi.to")) {
      return parseMachiPage(normalizedUrl);
    }

    return parseChStylePage(normalizedUrl);
  } catch {
    return null;
  }

  return null;
}

export function shouldHandleUrlWithApp(
  absoluteUrl: string,
  mode?: UrlHandlingMode,
): boolean {
  if (mode !== RESPECT_DEFAULT_EXTERNAL) {
    return true;
  }

  return parseInternalBrowserPage(absoluteUrl) != null;
}
