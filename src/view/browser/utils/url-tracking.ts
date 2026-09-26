import { compileSanitizer } from "@url-sanitize/core";
import { mergedCatalog } from "@url-sanitize/merged";

// 変更理由: ClearURLs・AdGuard・Brave・Firefoxの保守するルールを使い、
// 個別サービスの追跡キーを手作業で増やし続けない。紹介用パラメータも貼り付け時は除去する。
const sanitizeUrl = compileSanitizer(mergedCatalog, {
  stripReferralMarketing: true,
  unwrapRedirects: false,
  domainBlocking: false,
});

const URL_TOKEN_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.;!?\]}、。！？]+$/u;
const PINTEREST_HOST = /(^|\.)pinterest\.com$/i;
const PINTEREST_TRACKING_PARAMETERS = new Set(["_epik"]);
const INSTAGRAM_HOST = /(^|\.)instagram\.com$/i;
const YOUTUBE_HOST = /(^|\.)youtube\.com$/i;

function restoreFunctionalParameters(originalUrl: string, sanitizedUrl: string): string {
  const original = new URL(originalUrl);
  if (!YOUTUBE_HOST.test(original.hostname) || original.searchParams.get("feature") !== "shared") {
    return sanitizedUrl;
  }

  const sanitized = new URL(sanitizedUrl);
  // 変更理由: ClearURLs分類のfeature=sharedは共有機能を表すため、計測用と誤認して消さない。
  sanitized.searchParams.set("feature", "shared");
  return sanitized.href;
}

function hasFunctionalYoutubeShareFeature(url: string): boolean {
  try {
    const parsed = new URL(url);
    return YOUTUBE_HOST.test(parsed.hostname) && parsed.searchParams.get("feature") === "shared";
  } catch {
    return false;
  }
}

function splitUrlToken(token: string): { url: string; trailing: string } {
  const trailing = token.match(TRAILING_URL_PUNCTUATION)?.[0] ?? "";
  return { url: trailing ? token.slice(0, -trailing.length) : token, trailing };
}

export interface SanitizedUrlText {
  text: string;
  removedParameters: string[];
}

/**
 * テキスト中のURLだけを上流カタログで整え、本文や周囲の句読点は保つ。
 * 呼び出し側が貼り付け処理と投稿前警告を独立して選べるよう、文字列変換だけを担当する。
 */
export function sanitizeUrlsInText(text: string): SanitizedUrlText {
  const removedParameters = new Set<string>();
  const sanitizedText = text.replace(URL_TOKEN_PATTERN, (token) => {
    const { url, trailing } = splitUrlToken(token);
    const result = sanitizeUrl(url);
    // 変更理由: URL再構成など追跡パラメータ除去以外の変更を混ぜず、検出内容と変換内容を一致させる。
    const removedByUpstream =
      result.kind === "cleaned"
        ? result.strippedParams.filter(
            (parameter) =>
              !(parameter.toLowerCase() === "feature" && hasFunctionalYoutubeShareFeature(url)),
          )
        : [];
    let sanitizedUrl = result.kind === "cleaned" && removedByUpstream.length > 0 ? result.url : url;
    if (removedByUpstream.length > 0) {
      try {
        sanitizedUrl = restoreFunctionalParameters(url, sanitizedUrl);
      } catch {
        return token;
      }
    }
    const removed = new Set(removedByUpstream);

    // 変更理由: 利用者の希望に従い、Instagramでは未知の値や機能用の値も含めてクエリ全体を捨てる。
    try {
      const parsed = new URL(sanitizedUrl);
      if (INSTAGRAM_HOST.test(parsed.hostname) && parsed.search) {
        for (const key of parsed.searchParams.keys()) {
          removed.add(key || "（名前なし）");
        }
        parsed.search = "";
        sanitizedUrl = parsed.href;
      } else if (PINTEREST_HOST.test(parsed.hostname)) {
        for (const key of Array.from(parsed.searchParams.keys())) {
          if (PINTEREST_TRACKING_PARAMETERS.has(key.toLowerCase())) {
            parsed.searchParams.delete(key);
            removed.add(key);
          }
        }
        sanitizedUrl = parsed.href;
      }
    } catch {
      return token;
    }

    if (removed.size === 0) return token;

    for (const parameter of removed) removedParameters.add(parameter);
    return `${sanitizedUrl}${trailing}`;
  });

  return { text: sanitizedText, removedParameters: Array.from(removedParameters) };
}
