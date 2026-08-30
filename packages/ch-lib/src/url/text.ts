// URL本文解析に使う共通パターン。
// 変更理由: 表示処理とメディア判定が別々のURL正規表現を持つと、同じ本文でも
// 表示・検索・メディア解決の結果がずれるため、共有ライブラリで一元管理する。

const OBFUSCATED_PROTOCOLS: Readonly<Record<string, string>> = {
  p: "http:",
  ps: "https:",
  s: "https:",
  tp: "http:",
  tps: "https:",
  ttp: "http:",
  ttps: "https:",
};

// 掲示板では自動リンク化を避けるため、URLの先頭を削った表記が使われることがある。
// 復元対象は p:// / tp:// / ttp:// を http:// に、
// ps:// / s:// / tps:// / ttps:// を https:// に置き換えた形式で、
// スキームを完全に省略した :// は指定された既定プロトコル（省略時は https://）で補完する。
// 転載文などに混ざる http:/ / https:/ のスラッシュ1本抜けも、リンク先だけ補正する。
// 通常の http:// と https:// はそのまま扱い、いずれもホスト名・パス・クエリは変更しない。
export const URL_LIKE_PATTERN =
  /(?:https?:\/\/|https?:\/(?!\/)|(?:p|ps|s|tp|tps|ttp|ttps):\/\/|(?<![A-Za-z0-9+.-]):\/\/)[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;

export function normalizeObfuscatedUrl(rawUrl: string, fallbackProtocol?: string): string {
  if (rawUrl.startsWith("://")) {
    // :// だけでは元のスキームを復元できないため、安全側の https を既定にする。
    const protocol = fallbackProtocol?.toLowerCase() === "http:" ? "http:" : "https:";
    return `${protocol}//${rawUrl.slice(3)}`;
  }

  const singleSlashMatch = rawUrl.match(/^(https?):\/(?!\/)/i);
  if (singleSlashMatch) {
    // 転載時の誤記を救済しつつ、http/https以外のスキームは勝手に書き換えない。
    return `${singleSlashMatch[1]}://${rawUrl.slice(singleSlashMatch[0].length)}`;
  }

  const match = rawUrl.match(/^(https?):\/\/|^(p|ps|s|tp|tps|ttp|ttps):\/\//i);
  const obfuscatedProtocol = match?.[2]?.toLowerCase();
  const restoredProtocol = obfuscatedProtocol ? OBFUSCATED_PROTOCOLS[obfuscatedProtocol] : null;
  if (!match || !restoredProtocol) return rawUrl;
  return `${restoredProtocol}//${rawUrl.slice(match[0].length)}`;
}
