const OBFUSCATED_PROTOCOLS: Record<string, string> = {
  p: "http:",
  ps: "https:",
  s: "https:",
  tp: "http:",
  tps: "https:",
  ttp: "http:",
  ttps: "https:",
};

// 掲示板では自動リンク化を避けるため、URL の先頭を削った表記が使われることがある。
// 通常の URL と区別できるよう、ここではスキーム部分だけを復元し、ホスト名などは変更しない。
export const URL_LIKE_PATTERN =
  /(?:https?:\/\/|(?:p|ps|s|tp|tps|ttp|ttps):\/\/)[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;

export function normalizeObfuscatedUrl(rawUrl: string): string {
  const match = rawUrl.match(/^(https?):\/\/|^(p|ps|s|tp|tps|ttp|ttps):\/\//i);
  const obfuscatedProtocol = match?.[2]?.toLowerCase();
  const restoredProtocol = obfuscatedProtocol ? OBFUSCATED_PROTOCOLS[obfuscatedProtocol] : null;
  if (!match || !restoredProtocol) return rawUrl;
  return `${restoredProtocol}//${rawUrl.slice(match[0].length)}`;
}
