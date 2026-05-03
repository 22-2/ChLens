export type ExternalVideoProvider = "youtube";

export interface ExternalVideoEmbed {
  provider: ExternalVideoProvider;
  rawUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  fallbackThumbnailUrl: string;
  providerLabel: string;
  iframeTitle: string;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const youtubeFallbackThumbnailUrl = createThumbnailPlaceholder(
  "YouTube",
  "#ef4444",
  "#111827",
);
const nativeVideoFallbackThumbnailUrl = createThumbnailPlaceholder(
  "VIDEO",
  "#f8fafc",
  "#0f172a",
);
const DIRECT_VIDEO_REG = /\.(?:mp4|m4v|webm|ogv|mov|avi)(?:[?#:].*)?$/i;

function createThumbnailPlaceholder(
  providerLabel: string,
  accentColor: string,
  backgroundColor: string,
): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 208 208" role="img" aria-label="${providerLabel}">
      <rect width="208" height="208" rx="20" fill="${backgroundColor}" />
      <circle cx="104" cy="86" r="34" fill="${accentColor}" opacity="0.16" />
      <path d="M92 68v36l32-18-32-18Z" fill="${accentColor}" />
      <rect x="28" y="142" width="152" height="30" rx="15" fill="rgba(255,255,255,0.08)" />
      <text x="104" y="161" fill="#ffffff" font-family="Segoe UI, sans-serif" font-size="17" font-weight="700" text-anchor="middle">${providerLabel}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function isValidYouTubeVideoId(value: string | null): value is string {
  return value != null && /^[\w-]{11}$/.test(value);
}

function extractYouTubeVideoId(url: URL): string | null {
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  if (url.hostname.toLowerCase() === "youtu.be") {
    const shortId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    return isValidYouTubeVideoId(shortId) ? shortId : null;
  }

  if (url.pathname === "/watch") {
    const watchId = url.searchParams.get("v");
    return isValidYouTubeVideoId(watchId) ? watchId : null;
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const embedPrefixes = new Set(["embed", "shorts", "live", "v"]);
  if (pathParts.length >= 2 && embedPrefixes.has(pathParts[0])) {
    const embeddedId = pathParts[1] ?? null;
    return isValidYouTubeVideoId(embeddedId) ? embeddedId : null;
  }

  return null;
}

export function toInlineVideoEmbed(rawUrl: string): ExternalVideoEmbed | null {
  try {
    const parsedUrl = new URL(rawUrl);
    const youtubeVideoId = extractYouTubeVideoId(parsedUrl);
    if (youtubeVideoId) {
      return {
        provider: "youtube",
        rawUrl,
        // モーダルではなくレス内で開くため、通常ページではなく iframe 用URLをここで確定させる。
        embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeVideoId}?rel=0&modestbranding=1`,
        thumbnailUrl: `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`,
        fallbackThumbnailUrl: youtubeFallbackThumbnailUrl,
        providerLabel: "YouTube",
        iframeTitle: "YouTube 動画プレーヤー",
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function isDirectVideoUrl(rawUrl: string): boolean {
  try {
    return DIRECT_VIDEO_REG.test(new URL(rawUrl).pathname);
  } catch {
    return DIRECT_VIDEO_REG.test(rawUrl);
  }
}

export function getDirectVideoLabel(rawUrl: string): string {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    if (hostname.endsWith("twimg.com")) {
      return "Twitter Video";
    }
  } catch {
    // URL として解釈できない場合は汎用ラベルを返す。
  }

  return "Video";
}

export function getDirectVideoFallbackThumbnailUrl(): string {
  return nativeVideoFallbackThumbnailUrl;
}

export function isInlineVideoEmbedUrl(rawUrl: string): boolean {
  return isDirectVideoUrl(rawUrl) || toInlineVideoEmbed(rawUrl) != null;
}
