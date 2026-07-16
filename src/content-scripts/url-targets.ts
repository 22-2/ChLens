import { PATTERNS } from "packages/ch-lib/src/index";

const CH_HOST_SUFFIX_PATTERN =
  /(?:\.5ch\.io|\.[25]ch\.net|\.2ch\.sc|\.open2ch\.net|\.bbspink\.com)$/i;
const DISALLOWED_2CH_PREFIX_PATTERN = /^(?:find|info|p2)\./i;
const ULA_HOST_PATTERN = /^ula\.[25]ch\.net$/i;
const C2CH_HOST_PATTERN = /^c\.2ch\.net$/i;
const MACHI_HOST_PATTERN = /(?:^|\.)machi\.to$/i;
const CH_BOARD_INDEX_PATTERN =
  /^(?:\/(?:subback\/)?[\w-]+\/?(?:index\.html)?|\/test\/-\/[\w-]+\/i?)$/;
const C2CH_THREAD_PATTERN = /^\/test\/-\/[\w-]+\/\d+\/(?:[ig]|\d+)?$/;
const MACHI_BOARD_INDEX_PATTERN = /^\/[\w-]+\/?(?:index\.html)?$/;

export function normalizeContentScriptTargetUrl(url: string): string {
  const eddibbMatch = url.match(/^https:\/\/bbs\.eddibb\.cc\/(\w+)\/(\d+)\/?$/i);
  if (!eddibbMatch) {
    return url;
  }

  // 変更理由: bbs.eddibb.cc の素URLは内部処理系が /test/read.cgi を前提にしているため、
  // content script 側で入口を正規化して遷移先解釈を統一する。
  return `http://bbs.eddibb.cc/test/read.cgi/${eddibbMatch[1]}/${eddibbMatch[2]}/`;
}

function isChHost(hostname: string): boolean {
  return CH_HOST_SUFFIX_PATTERN.test(hostname) && !DISALLOWED_2CH_PREFIX_PATTERN.test(hostname);
}

function isChLikeTarget(hostname: string, pathname: string): boolean {
  if (!isChHost(hostname)) {
    return false;
  }

  return (
    PATTERNS.CH_THREAD.test(pathname) ||
    PATTERNS.CH_BOARD.test(pathname) ||
    CH_BOARD_INDEX_PATTERN.test(pathname)
  );
}

function isJbbsTarget(hostname: string, pathname: string): boolean {
  if (hostname !== "jbbs.shitaraba.net") {
    return false;
  }

  return (
    PATTERNS.SHITARABA_THREAD.test(pathname) ||
    PATTERNS.SHITARABA_ARCHIVE.test(pathname) ||
    PATTERNS.SHITARABA_BOARD.test(pathname)
  );
}

function isMachiTarget(hostname: string, pathname: string): boolean {
  if (!MACHI_HOST_PATTERN.test(hostname)) {
    return false;
  }

  return PATTERNS.MACHI_THREAD.test(pathname) || MACHI_BOARD_INDEX_PATTERN.test(pathname);
}

function isEddibbTarget(hostname: string, pathname: string): boolean {
  if (hostname !== "bbs.eddibb.cc") {
    return false;
  }

  return PATTERNS.EDDIBB_THREAD.test(pathname) || PATTERNS.EDDIBB_THREAD_2.test(pathname);
}

function isUlaTarget(hostname: string, pathname: string): boolean {
  return ULA_HOST_PATTERN.test(hostname) && PATTERNS.CH_THREAD_ULA.test(pathname);
}

function isC2chTarget(hostname: string, pathname: string): boolean {
  if (!C2CH_HOST_PATTERN.test(hostname)) {
    return false;
  }

  return CH_BOARD_INDEX_PATTERN.test(pathname) || C2CH_THREAD_PATTERN.test(pathname);
}

export function isTargetContentScriptUrl(rawUrl: string): boolean {
  try {
    const parsed = new window.URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    return (
      isChLikeTarget(hostname, pathname) ||
      isJbbsTarget(hostname, pathname) ||
      isMachiTarget(hostname, pathname) ||
      isEddibbTarget(hostname, pathname) ||
      isUlaTarget(hostname, pathname) ||
      isC2chTarget(hostname, pathname)
    );
  } catch {
    return false;
  }
}
