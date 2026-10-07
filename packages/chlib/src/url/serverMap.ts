import { HOSTNAME, normalizeBbsHostname } from "./hosts";
import { resolveBoardUrl, type ResolvedBoardUrl } from "./resolveBoardUrl";

export type BoardServerNetwork =
  | "5ch"
  | "2ch-sc"
  | "bbspink"
  | "open2ch"
  | "machi"
  | "shitaraba"
  | "eddibb"
  | "unknown";

export interface BoardServerInfo {
  boardName: string;
  serverName: string;
  network: "5ch" | "2ch-sc" | "bbspink";
}

export interface BoardServerTarget {
  network: BoardServerInfo["network"];
  serverName: string;
}

/** URLのホストから掲示板ネットワークを分類する。 */
export function getBoardNetwork(input: string | URL): BoardServerNetwork {
  let hostname: string;
  try {
    hostname = normalizeBbsHostname(new URL(input.toString()).hostname.toLowerCase());
  } catch {
    return "unknown";
  }

  if (hostname.endsWith(`.${HOSTNAME.BBSPINK}`)) return "bbspink";
  if (hostname === HOSTNAME.BBSPINK) return "bbspink";
  if (hostname === HOSTNAME.ITEST_BBSPINK) return "bbspink";
  if (hostname === HOSTNAME.ITEST_5CH) return "5ch";
  if (hostname.endsWith(`.${HOSTNAME.CH_2_SC}`) || hostname === HOSTNAME.CH_2_SC) return "2ch-sc";
  if (
    hostname.endsWith(`.${HOSTNAME.NEW_5CH}`) ||
    hostname === HOSTNAME.NEW_5CH ||
    hostname.endsWith(`.${HOSTNAME.OLD_5CH_NET}`) ||
    hostname === HOSTNAME.OLD_5CH_NET ||
    hostname.endsWith(`.${HOSTNAME.OLD_2CH}`) ||
    hostname === HOSTNAME.OLD_2CH
  ) {
    return "5ch";
  }
  if (hostname.endsWith(`.${HOSTNAME.OPEN2CH}`) || hostname === HOSTNAME.OPEN2CH) return "open2ch";
  if (hostname.endsWith(`.${HOSTNAME.MACHI}`) || hostname === HOSTNAME.MACHI) return "machi";
  if (hostname === HOSTNAME.NEW_JBBS || hostname === HOSTNAME.OLD_JBBS) return "shitaraba";
  if (hostname === HOSTNAME.EDDIBB) return "eddibb";
  return "unknown";
}

function hostnameFor(network: BoardServerTarget["network"], serverName: string): string {
  const domain = serverDomain(network);
  return `${serverName}.${domain}`;
}

function serverDomain(network: BoardServerTarget["network"]): string {
  return {
    "5ch": HOSTNAME.NEW_5CH,
    "2ch-sc": HOSTNAME.CH_2_SC,
    bbspink: HOSTNAME.BBSPINK,
  }[network];
}

/** 板URLまたはスレッドURLから、bbsmenuに必要な板・サーバー情報を得る。 */
export function extractBoardServerInfo(input: string | URL): BoardServerInfo | null {
  let url: URL;
  try {
    url = new URL(input.toString());
  } catch {
    return null;
  }
  url.hostname = normalizeBbsHostname(url.hostname.toLowerCase());

  const network = getBoardNetwork(url);
  if (network !== "5ch" && network !== "2ch-sc" && network !== "bbspink") return null;

  const serverName = url.hostname.slice(0, -serverDomain(network).length - 1);
  if (!serverName || serverName.includes(".")) return null;

  const route = resolveBoardUrl(url.href, { mode: "browse" });
  const boardName = route?.boardName ?? url.pathname.split("/").filter(Boolean)[0];
  if (!boardName) return null;

  return {
    boardName: boardName.split("/")[0],
    serverName,
    network,
  };
}

/** URLの掲示板サーバーだけを差し替え、パス・クエリ・フラグメントを保つ。 */
export function replaceBoardServer(input: string | URL, target: BoardServerTarget): string | null {
  try {
    const url = new URL(input.toString());
    url.hostname = hostnameFor(target.network, target.serverName);
    return url.href;
  } catch {
    return null;
  }
}

/** bbsmenuの板URL群から、itestの板キー→取得先ホスト対応表を作る。 */
export function createItestServerMap(boardUrls: readonly string[]): Map<string, string> {
  const serverMap = new Map<string, string>();
  for (const boardUrl of boardUrls) {
    const info = extractBoardServerInfo(boardUrl);
    if (!info) continue;
    const hostname = hostnameFor(info.network, info.serverName);
    if (!serverMap.has(info.boardName)) serverMap.set(info.boardName, hostname);
  }
  return serverMap;
}

/** 5chのsubject.txt応答が別ホストへ移転したとき、移転先の板URLを返す。 */
export function resolveBoardRedirectUrl(
  sourceBoardUrl: string | URL,
  responseUrl: string,
): string | null {
  try {
    const source = new URL(sourceBoardUrl.toString());
    const response = new URL(responseUrl);
    if (
      getBoardNetwork(source) !== "5ch" ||
      getBoardNetwork(response) !== "5ch" ||
      source.hostname === response.hostname
    ) {
      return null;
    }
    if (!response.pathname.endsWith("/subject.txt")) return null;
    response.pathname = response.pathname.slice(0, -"subject.txt".length);
    const destination = resolveBoardUrl(response.href, { mode: "browse" });
    const sourceBoard = resolveBoardUrl(source.href, { mode: "browse" });
    if (destination?.type !== "board") return null;
    if (sourceBoard?.type === "board" && sourceBoard.boardName !== destination.boardName)
      return null;
    return destination.boardUrl;
  } catch {
    return null;
  }
}

function resolveFivechBoard(input: string | URL): ResolvedBoardUrl | null {
  const resolved = resolveBoardUrl(input.toString(), { mode: "browse" });
  return resolved?.type === "board" && getBoardNetwork(resolved.boardUrl) === "5ch"
    ? resolved
    : null;
}

/** 移転元・HTMLの移動先・GET最終URLから、安全な5ch板URLだけを解決する。 */
export function resolveBoardMoveUrl(
  sourceBoardUrl: string | URL,
  targetUrl: string,
  responseUrl?: string,
): string | null {
  let source: URL;
  try {
    source = new URL(sourceBoardUrl.toString());
  } catch {
    return null;
  }
  if (getBoardNetwork(source) !== "5ch") return null;

  const sourceBoard = resolveFivechBoard(source);
  const matchesSourceBoard = (candidate: ResolvedBoardUrl): boolean =>
    sourceBoard === null || sourceBoard.boardName === candidate.boardName;

  const target = resolveFivechBoard(targetUrl);
  if (target && matchesSourceBoard(target)) return target.boardUrl;

  if (!responseUrl) return null;
  let response: URL;
  try {
    response = new URL(responseUrl);
  } catch {
    return null;
  }
  if (getBoardNetwork(response) !== "5ch") return null;

  const directResponse = resolveFivechBoard(response);
  if (directResponse && matchesSourceBoard(directResponse)) return directResponse.boardUrl;

  if (response.pathname.endsWith("/subject.txt")) {
    response.pathname = response.pathname.slice(0, -"subject.txt".length);
    const subjectBoard = resolveFivechBoard(response);
    if (subjectBoard && matchesSourceBoard(subjectBoard)) return subjectBoard.boardUrl;
  }
  return null;
}

/** 移転先の掲示板サーバーへ移し、スレッドのパスやレス指定はそのまま保つ。 */
export function replaceBoardUrlServer(
  sourceUrl: string | URL,
  destinationBoardUrl: string | URL,
): string | null {
  let source: URL;
  try {
    source = new URL(sourceUrl.toString());
  } catch {
    return null;
  }
  const destination = resolveBoardUrl(destinationBoardUrl.toString(), { mode: "browse" });
  if (destination?.type !== "board") return null;
  const destinationUrl = new URL(destination.boardUrl);
  source.protocol = destinationUrl.protocol;
  source.hostname = destinationUrl.hostname;
  source.port = destinationUrl.port;
  source.username = destinationUrl.username;
  source.password = destinationUrl.password;
  return source.href;
}

/** スレッドリンクを本文から探す際に使う、旧形式と完全URLの照合キーを返す。 */
export function getThreadReferenceKeys(input: string | URL): string[] {
  try {
    const url = new URL(input.toString());
    const href = url.href;
    if (
      [HOSTNAME.OLD_2CH, HOSTNAME.OLD_5CH_NET, HOSTNAME.CH_2_SC].some((domain) =>
        url.hostname.endsWith(`.${domain}`),
      )
    ) {
      const firstDomainDot = url.hostname.indexOf(".");
      const suffix = `${url.hostname.slice(firstDomainDot)}${url.pathname}${url.search}${url.hash}`;
      return Array.from(new Set([suffix, href]));
    }
    return [href];
  } catch {
    return [input.toString()];
  }
}

/** BBS種類と板識別子から、外部のSikiGuard取得先URLを作る。 */
export function createSikiGuardRequestUrl(threadUrl: string): string | null {
  const network = getBoardNetwork(threadUrl);
  if (network !== "5ch" && network !== "bbspink") return null;
  const resolved = resolveBoardUrl(threadUrl, { mode: "browse" });
  if (!resolved || resolved.type !== "thread") return null;
  const serviceNetwork = network === "5ch" ? "5ch.io" : "bbspink.com";
  return `https://sikiguard.net/${serviceNetwork}/${encodeURIComponent(resolved.boardName.split("/")[0] ?? "")}/id.json`;
}
