import { ChURL } from "./ChURL";
import { HOSTNAME, isArchiveOnlyBoardHost, isCompatibleBoardHost } from "./hosts";

export interface BoardUrlNormalizationOptions {
  requireCompatibleHost?: boolean;
  subjectVerified?: boolean;
}

/** Board URLの表示・保存・重複判定用の正規形を作る。 */
export function normalizeBoardUrl(
  rawUrl: string,
  options: BoardUrlNormalizationOptions = {},
): string | null {
  const trimmedUrl = rawUrl.trim();
  if (trimmedUrl === "") return null;

  let inputUrl: URL;
  let parsed: ChURL;
  try {
    inputUrl = new URL(trimmedUrl);
    parsed = new ChURL(trimmedUrl);
  } catch {
    return null;
  }

  if (isArchiveOnlyBoardHost(parsed.hostname)) return null;
  let boardUrl =
    parsed.type === "thread" ? parsed.toBoard() : parsed.type === "board" ? parsed : null;

  // 古い共通判定の文字種を保ちつつ、互換ホスト上のハイフン板名を受け付ける。
  if (boardUrl === null && isCompatibleBoardHost(inputUrl.hostname)) {
    const path = inputUrl.pathname;
    const isSingleSegmentBoard = /^\/(?:subback\/|test\/-\/)?[\w-]+\/?$/u.test(path);
    const isShitarabaBoard =
      inputUrl.hostname.endsWith(".shitaraba.net") && /^\/[\w-]+\/[\w-]+\/?$/u.test(path);
    if (isSingleSegmentBoard || isShitarabaBoard) boardUrl = new ChURL(inputUrl.href);
  }
  if (boardUrl === null) return null;

  const normalized = new URL(boardUrl.href);
  normalized.hostname = normalized.hostname.toLowerCase();
  normalized.search = "";
  normalized.hash = "";
  if (normalized.hostname.includes("*") || normalized.hostname.includes("%")) return null;
  if (
    options.requireCompatibleHost &&
    !options.subjectVerified &&
    !isCompatibleBoardHost(normalized.hostname)
  ) {
    return null;
  }

  if (normalized.hostname === HOSTNAME.EDDIBB) {
    const match = /^\/test\/read\.cgi\/([\w-]+)\/?$/i.exec(normalized.pathname);
    if (match) normalized.pathname = `/${match[1]}/`;
  }
  if (!normalized.pathname.endsWith("/")) normalized.pathname += "/";
  return normalized.href;
}

/** 板URLのprotocol-independent identityを返す。 */
export function getBoardUrlKey(
  rawUrl: string,
  options: BoardUrlNormalizationOptions = {},
): string | null {
  const normalizedUrl = normalizeBoardUrl(rawUrl, options);
  if (normalizedUrl === null) return null;
  const url = new URL(normalizedUrl);
  return `${url.host.toLowerCase()}${url.pathname}`;
}
