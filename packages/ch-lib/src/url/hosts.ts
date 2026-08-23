// 5ch互換掲示板のホスト名に関するドメイン知識を集約する。
// 変更理由: 移転マップ(2ch.net→5ch.io 等)や互換ホスト判定が
// core/URL.ts・link-routing.ts・ChURL.ts に三重に実装されており、
// 片方だけ修正されて解釈がずれる回帰が起きやすかったため1箇所に集約する。

export const HOSTNAME = {
  OLD_2CH: "2ch.net",
  OLD_5CH_NET: "5ch.net",
  NEW_5CH: "5ch.io",
  OLD_JBBS: "jbbs.livedoor.jp",
  NEW_JBBS: "jbbs.shitaraba.net",
  ULA_5CH: "ula.5ch.io",
  EDDIBB: "bbs.eddibb.cc",
  ITEST_5CH: "itest.5ch.io",
  ITEST_BBSPINK: "itest.bbspink.com",
} as const;

export const TSLD = {
  CH_5: "5ch.io",
  BBSPINK: "bbspink.com",
  CH_2_SC: "2ch.sc",
} as const;

/** hostname が suffix そのもの、またはそのサブドメインかを判定する */
export function hasHostnameSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

/**
 * 掲示板の移転を反映した正規ホスト名を返す。
 * (2ch.net / 5ch.net → 5ch.io、jbbs.livedoor.jp → jbbs.shitaraba.net)
 */
export function normalizeBbsHostname(hostname: string): string {
  if (hasHostnameSuffix(hostname, HOSTNAME.OLD_2CH)) {
    return hostname.replace(
      new RegExp(`${HOSTNAME.OLD_2CH.replace(".", "\\.")}$`),
      HOSTNAME.NEW_5CH,
    );
  }
  if (hasHostnameSuffix(hostname, HOSTNAME.OLD_5CH_NET)) {
    // 変更理由: 5ch.net の旧板URLを新ドメインへ移す際、サブドメインだけを
    // 保持して置換することで、パスやクエリに同じ文字列を含むURLを誤変換しない。
    return hostname.replace(
      new RegExp(`${HOSTNAME.OLD_5CH_NET.replace(".", "\\.")}$`),
      HOSTNAME.NEW_5CH,
    );
  }
  if (hostname === HOSTNAME.OLD_JBBS) {
    return HOSTNAME.NEW_JBBS;
  }
  return hostname;
}

// 内部ブラウザで扱える互換掲示板のホスト。
// suffix はサブドメイン込みで一致、exact は完全一致で判定する。
const COMPATIBLE_HOST_SUFFIXES = [
  "5ch.io",
  HOSTNAME.OLD_5CH_NET,
  "2ch.sc",
  "2ch.net",
  "open2ch.net",
  "bbspink.com",
  "machi.to",
] as const;

const COMPATIBLE_EXACT_HOSTS = [HOSTNAME.NEW_JBBS, HOSTNAME.OLD_JBBS, HOSTNAME.EDDIBB] as const;

export function isCompatibleBoardHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    COMPATIBLE_EXACT_HOSTS.some((host) => h === host) ||
    COMPATIBLE_HOST_SUFFIXES.some((suffix) => hasHostnameSuffix(h, suffix))
  );
}

export type BoardHostType = "eddibb" | "shitaraba" | "machi" | "ch-style";

/**
 * ホスト名からURL構造の系統を分類する。
 * 互換ホストに該当しない場合は null を返す(imgur 等の一般URLを
 * 内部遷移対象と誤判定しないため、明示的な許可制にしている)。
 */
export function classifyBoardHost(hostname: string): BoardHostType | null {
  if (hostname === HOSTNAME.EDDIBB) return "eddibb";
  if (hostname === HOSTNAME.NEW_JBBS) return "shitaraba";
  if (hasHostnameSuffix(hostname, "machi.to")) return "machi";
  if (isCompatibleBoardHost(hostname)) return "ch-style";
  return null;
}
