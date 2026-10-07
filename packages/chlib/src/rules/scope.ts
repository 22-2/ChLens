import { PATTERNS } from "../url/patterns";

function getBoardFromUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const chThreadMatch = PATTERNS.CH_THREAD.exec(pathname);
    if (chThreadMatch) return chThreadMatch[1].split("/").at(-2) ?? null;
    const machiThreadMatch = PATTERNS.MACHI_THREAD.exec(pathname);
    if (machiThreadMatch) return machiThreadMatch[1].split("/")[0] ?? null;
    const shitarabaThreadMatch = PATTERNS.SHITARABA_THREAD.exec(pathname);
    if (shitarabaThreadMatch) return shitarabaThreadMatch[1].split("/").at(-2) ?? null;
    // 標準形式は先頭のCH_THREADで判定済みなので、ここでは短縮形式だけを補う。
    const shortThreadMatch = PATTERNS.CH_SHORT_THREAD.exec(pathname);
    if (shortThreadMatch) return shortThreadMatch[1] ?? null;
    const chBoardMatch = PATTERNS.CH_BOARD.exec(pathname);
    if (chBoardMatch) return chBoardMatch[1].replace(/\/$/u, "");
    const machiBoardMatch = PATTERNS.MACHI_BOARD.exec(pathname);
    if (machiBoardMatch) return machiBoardMatch[1].replace(/\/$/u, "");
    const shitarabaBoardMatch = PATTERNS.SHITARABA_BOARD.exec(pathname);
    if (shitarabaBoardMatch) return shitarabaBoardMatch[1].split("/")[1] ?? null;
    return PATTERNS.CH_BOARD_KEY.exec(pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function matchesRuleSites(sites: readonly string[] | undefined, url: string): boolean {
  if (!sites?.length || sites.includes("*")) return true;
  return sites.some((site) => {
    const slashIndex = site.indexOf("/");
    const domainMatch = url.match(/^https?:\/\/([^/]+)/u);
    if (slashIndex < 0) {
      return Boolean(domainMatch?.[1].includes(site)) || getBoardFromUrl(url) === site;
    }
    const domain = site.slice(0, slashIndex);
    const board = site.slice(slashIndex + 1);
    if (domain && !domainMatch?.[1].includes(domain)) return false;
    return board ? getBoardFromUrl(url) === board : Boolean(domain && domainMatch);
  });
}
