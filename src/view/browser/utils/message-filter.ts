import { normalizeObfuscatedUrl, URL_LIKE_PATTERN } from "src/core/network/url-utils";
import { isInlineVideoEmbedUrl } from "src/core/util/external-media";

/**
 * レス本文のメディア・外部リンク判定をまとめる。
 * フィルタは MessageProcessor の表示結果ではなく取得した生HTMLを判定するため、
 * レス表示やURL変換の実装とは独立した入力判定として保つ。
 */

/**
 * 変更理由: normalizeObfuscatedUrl を replace の関数引数として直接渡すと、第2引数に
 * 文字位置（数値）が渡って fallbackProtocol として扱われ、「://」で始まるURLで例外になる。
 * URLの文字列だけを渡すよう包む。
 */
function normalizeMessageUrls(message: string): string {
  return message.replace(URL_LIKE_PATTERN, (url) => normalizeObfuscatedUrl(url));
}

export function hasImage(message: string): boolean {
  const normalizedMessage = normalizeMessageUrls(message);
  return (
    // なぜサフィックスを許容するか: pbs.twimg.com の画像は「XXX.jpg:orig」のように
    // 拡張子の直後へコロン付きのサイズ指定（:thumb/:small/:medium/:large/:orig など）が付く。
    // コロン以下を拡張子の一部とみなすと画像判定から漏れるため、通常の画像として扱う。
    /\.(jpe?g|png|gif|webp|bmp|avif)(?::[a-z0-9]+)?(?:\?[^"<]*)?(?=["<\s]|$)/i.test(
      normalizedMessage,
    ) ||
    /https?:\/\/pbs\.twimg\.com\/media\/[^\s"'<>?]+\?[^\s"'<>]*format=(?:jpe?g|png|gif|webp|bmp|avif)\b/i.test(
      normalizedMessage,
    )
  );
}

export function hasVideo(message: string): boolean {
  const normalizedMessage = normalizeMessageUrls(message);
  return (
    /\.(mp4|webm|avi|mov)(?:\?[^"<]*)?(?=["<\s]|$)/i.test(normalizedMessage) ||
    /<video\b/i.test(normalizedMessage) ||
    (normalizedMessage
      .match(/https?:\/\/[^\s"'<>]+/gi)
      ?.some((url) => isInlineVideoEmbedUrl(url)) ??
      false)
  );
}

/** 本文の中のURLを絶対URLにそろえて取り出す。URLとして読めないものは除く。 */
function extractMessageUrls(message: string): URL[] {
  const urls: URL[] = [];
  for (const raw of message.match(new RegExp(URL_LIKE_PATTERN.source, "gi")) ?? []) {
    try {
      urls.push(new URL(normalizeObfuscatedUrl(raw)));
    } catch {
      // 本文に紛れた URL らしい文字列は壊れていることが多く、判定から外すだけでよい。
    }
  }
  return urls;
}

// 国別ドメインの「co.jp」のように、末尾2つでは組織を分けられない第2レベル。
const SECOND_LEVEL_LABELS = new Set(["co", "or", "ne", "ac", "go", "ed", "ad", "gr", "lg"]);
const GENERIC_SECOND_LEVEL_LABELS = new Set(["com", "net", "org", "gov", "edu"]);

/** 「mi.5ch.io」と「itest.5ch.io」を同じサイトとみなすための、サイト単位のドメイン。 */
export function siteDomainOf(host: string): string {
  const labels = host.toLowerCase().split(".");
  if (labels.length <= 2) return labels.join(".");
  const topLevel = labels.at(-1) ?? "";
  const secondLevel = labels.at(-2) ?? "";
  const isCountryCode = topLevel.length === 2;
  const keepThreeLabels =
    isCountryCode &&
    (SECOND_LEVEL_LABELS.has(secondLevel) || GENERIC_SECOND_LEVEL_LABELS.has(secondLevel));
  return labels.slice(keepThreeLabels ? -3 : -2).join(".");
}

function threadSiteDomain(threadUrl: string): string | null {
  try {
    return siteDomainOf(new URL(threadUrl).hostname);
  } catch {
    return null;
  }
}

/**
 * 本文に外部のリンクがあるか。
 * res.message はレンダリング前の生HTMLで、通常URLはまだ <a> タグ化されていない
 * （linkify は MessageProcessor が描画時に行う）ため、<a href> だけを見ると常に不一致になる。
 * 生テキスト中の http(s) URL と、先頭を削った URL も対象にする。
 * `threadUrl` を渡すと、そのスレッドと同じサイトのリンクは外部に数えない。
 */
export function hasExternalLink(message: string, threadUrl?: string): boolean {
  const site = threadUrl ? threadSiteDomain(threadUrl) : null;
  if (!site) return new RegExp(URL_LIKE_PATTERN.source, "i").test(message);
  return extractMessageUrls(message).some((url) => siteDomainOf(url.hostname) !== site);
}

/** 本文に、そのスレッドと同じサイト（ドメイン）へのリンクがあるか。 */
export function hasInternalLink(message: string, threadUrl: string): boolean {
  const site = threadSiteDomain(threadUrl);
  if (!site) return false;
  return extractMessageUrls(message).some((url) => siteDomainOf(url.hostname) === site);
}
