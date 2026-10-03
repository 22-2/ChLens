import { hasHostnameSuffix, HOSTNAME } from "./hosts";
import { PATTERNS } from "./patterns";

const DISALLOWED_2CH_PREFIX_PATTERN = /^(?:find|info|p2)\./i;
const CH_HOST_SUFFIX_PATTERN =
  /(?:\.5ch\.io|\.[25]ch\.net|\.2ch\.sc|\.open2ch\.net|\.bbspink\.com)$/i;
const ULA_HOST_PATTERN = /^ula\.[25]ch\.net$/i;
const C2CH_HOST_PATTERN = /^c\.2ch\.net$/i;
const CH_BOARD_INDEX_PATTERN =
  /^(?:\/(?:subback\/)?[\w-]+\/?(?:index\.html)?|\/test\/-\/[\w-]+\/?i?)$/;
const C2CH_THREAD_PATTERN = /^\/test\/-\/[\w-]+\/\d+\/(?:[ig]|\d+)?$/;
const MACHI_BOARD_INDEX_PATTERN = /^\/[\w-]+\/?(?:index\.html)?$/;

function isChHost(hostname: string): boolean {
  return CH_HOST_SUFFIX_PATTERN.test(hostname) && !DISALLOWED_2CH_PREFIX_PATTERN.test(hostname);
}

function isChLikeTarget(hostname: string, pathname: string): boolean {
  return (
    isChHost(hostname) &&
    (PATTERNS.CH_THREAD.test(pathname) ||
      PATTERNS.CH_BOARD.test(pathname) ||
      CH_BOARD_INDEX_PATTERN.test(pathname))
  );
}

function isShitarabaTarget(hostname: string, pathname: string): boolean {
  return (
    hostname === HOSTNAME.NEW_JBBS &&
    (PATTERNS.SHITARABA_THREAD.test(pathname) ||
      PATTERNS.SHITARABA_ARCHIVE.test(pathname) ||
      PATTERNS.SHITARABA_BOARD.test(pathname))
  );
}

function isMachiTarget(hostname: string, pathname: string): boolean {
  return (
    hasHostnameSuffix(hostname, "machi.to") &&
    (PATTERNS.MACHI_THREAD.test(pathname) || MACHI_BOARD_INDEX_PATTERN.test(pathname))
  );
}

function isEddibbTarget(hostname: string, pathname: string): boolean {
  return (
    hostname === HOSTNAME.EDDIBB &&
    (PATTERNS.CH_THREAD.test(pathname) || PATTERNS.CH_SHORT_THREAD.test(pathname))
  );
}

function isUlaTarget(hostname: string, pathname: string): boolean {
  return ULA_HOST_PATTERN.test(hostname) && PATTERNS.CH_THREAD_ULA.test(pathname);
}

function isC2chTarget(hostname: string, pathname: string): boolean {
  return (
    C2CH_HOST_PATTERN.test(hostname) &&
    (CH_BOARD_INDEX_PATTERN.test(pathname) || C2CH_THREAD_PATTERN.test(pathname))
  );
}

/** eddibb短縮スレッドURLを内部取得器が扱える形式へ正規化する。 */
export function normalizeContentScriptTargetUrl(rawUrl: string): string {
  const matched = /^https:\/\/bbs\.eddibb\.cc\/([\w-]+)\/(\d+)\/?$/i.exec(rawUrl);
  if (!matched) return rawUrl;
  return `http://bbs.eddibb.cc/test/read.cgi/${matched[1]}/${matched[2]}/`;
}

/** content scriptを注入する掲示板URLかを判定する。 */
export function isTargetContentScriptUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname;
  return (
    isChLikeTarget(hostname, pathname) ||
    isShitarabaTarget(hostname, pathname) ||
    isMachiTarget(hostname, pathname) ||
    isEddibbTarget(hostname, pathname) ||
    isUlaTarget(hostname, pathname) ||
    isC2chTarget(hostname, pathname)
  );
}
