import { URL_LIKE_PATTERN, normalizeObfuscatedUrl } from "./text";

const IMAGE_PATH_PATTERN = /\.(?:jpe?g|png|gif|webp|bmp|avif)$/iu;
const LINK_HREF_PATTERN = /<a\b[^>]*\s+href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gis;
const IMAGE_SRC_PATTERN = /<img\b[^>]*\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gis;

function normalizeExtractedUrl(rawUrl: string, fallbackProtocol: string): string | null {
  const trimmed = rawUrl.trim().replace(/[),.;]+$/u, "");
  if (!trimmed) return null;

  const protocol = fallbackProtocol.toLowerCase() === "http:" ? "http:" : "https:";
  const withProtocol = trimmed.startsWith("//") ? `${protocol}${trimmed}` : trimmed;
  const normalized = normalizeObfuscatedUrl(withProtocol, protocol);
  return /^https?:\/\//iu.test(normalized) ? normalized : null;
}

function collectAttributeUrls(message: string): string[] {
  const urls: string[] = [];
  for (const pattern of [LINK_HREF_PATTERN, IMAGE_SRC_PATTERN]) {
    for (const match of message.matchAll(pattern)) {
      const value = match.slice(1).find((candidate) => candidate != null);
      if (value != null) {
        urls.push(value);
      }
    }
  }
  return urls;
}

/** 本文からURLを抽出し、表示側と同じく正規化済みURLを重複なく返す。 */
export function extractUrlsFromMessage(message: string, fallbackProtocol = "https:"): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const pushUrl = (rawUrl: string): void => {
    const normalized = normalizeExtractedUrl(rawUrl, fallbackProtocol);
    if (normalized == null || seen.has(normalized)) return;
    seen.add(normalized);
    urls.push(normalized);
  };

  for (const rawUrl of collectAttributeUrls(message)) {
    pushUrl(rawUrl);
  }
  for (const rawUrl of message.match(URL_LIKE_PATTERN) ?? []) {
    pushUrl(rawUrl);
  }

  return urls;
}

/** 生URLをメディアギャラリーで表示できる画像URLへ変換する。 */
export function toViewerImageUrl(rawUrl: string): string | null {
  try {
    const url = new URL(normalizeObfuscatedUrl(rawUrl));
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname;

    // Imgurの単体URLは拡張子がなくても画像として表示できるため、拡張子判定より先に扱う。
    if (host === "i.imgur.com") {
      const match = pathname.match(/^\/([a-z0-9]+)\.([a-z]+)$/iu);
      if (match) {
        const [, id, ext] = match;
        return `https://i.imgur.com/${id}m.${ext}`;
      }
      return url.href;
    }

    if (host === "imgur.com" || host === "m.imgur.com") {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length === 1) {
        const id = parts[0].split(".")[0];
        if (id) return `https://i.imgur.com/${id}m.jpg`;
      }

      // アルバムURLはAPI解決前のコンテナであり、単一画像として数えない。
      if (parts.length === 2 && parts[0].toLowerCase() === "a") return null;
    }

    if (IMAGE_PATH_PATTERN.test(pathname)) return url.href;

    if (
      host === "pbs.twimg.com" &&
      pathname.startsWith("/media/") &&
      /^(?:jpe?g|png|gif|webp|bmp|avif)$/iu.test(url.searchParams.get("format") ?? "")
    ) {
      return url.href;
    }
  } catch (error: unknown) {
    // 本文には壊れたURLも混ざり得るため、1件の不正値でレス全体のNG判定を止めない。
    console.error("[ch-lib] 画像URLの解析に失敗しました", { rawUrl, error });
  }
  return null;
}

/** 本文内で表示可能な画像URLだけを数える。重複URLはギャラリーと同じく1件にまとめる。 */
export function extractImageUrlsFromMessage(
  message: string,
  fallbackProtocol = "https:",
): string[] {
  return extractUrlsFromMessage(message, fallbackProtocol).filter(
    (url) => toViewerImageUrl(url) != null,
  );
}

export function countImageUrlsInMessage(message: string, fallbackProtocol = "https:"): number {
  return extractImageUrlsFromMessage(message, fallbackProtocol).length;
}
