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
// 通常のURLと区別できるよう、ここではスキーム部分だけを復元し、ホスト名などは変更しない。
export const URL_LIKE_PATTERN =
  /(?:https?:\/\/|(?:p|ps|s|tp|tps|ttp|ttps):\/\/)[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;

export function normalizeObfuscatedUrl(rawUrl: string): string {
  const match = rawUrl.match(/^(https?):\/\/|^(p|ps|s|tp|tps|ttp|ttps):\/\//i);
  const obfuscatedProtocol = match?.[2]?.toLowerCase();
  const restoredProtocol = obfuscatedProtocol ? OBFUSCATED_PROTOCOLS[obfuscatedProtocol] : null;
  if (!match || !restoredProtocol) return rawUrl;
  return `${restoredProtocol}//${rawUrl.slice(match[0].length)}`;
}
