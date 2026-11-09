import { toOriginalImageUrl, toViewerImageUrl } from "src/core/util/url-media";

/** 表示中の画像より前方（次の画像側）へ先読みする件数。 */
export const PRELOAD_AHEAD_COUNT = 2;
/** 表示中の画像より後方（前の画像側）へ先読みする件数。 */
export const PRELOAD_BEHIND_COUNT = 1;

/** ビューアが実際に読み込むURLと同じ形へそろえる。そろえないとブラウザのキャッシュが効かない。 */
function toViewerSrc(rawUrl: string): string | null {
  const imageUrl = toViewerImageUrl(rawUrl);
  if (!imageUrl) return null;
  return toOriginalImageUrl(imageUrl) ?? imageUrl;
}

/**
 * 先読みするURLを優先順に返す。次の画像を先にし、前の画像は最後にする。
 * 画像として表示できないURL（動画など）と、表示中の画像と同じURLは含めない。
 */
export function listPreloadUrls(
  images: readonly string[] | undefined,
  currentIndex: number | undefined,
): string[] {
  if (!images || currentIndex == null) return [];
  const indexes = [
    ...Array.from({ length: PRELOAD_AHEAD_COUNT }, (_, i) => currentIndex + 1 + i),
    ...Array.from({ length: PRELOAD_BEHIND_COUNT }, (_, i) => currentIndex - 1 - i),
  ];
  const currentSrc = images[currentIndex] ? toViewerSrc(images[currentIndex]) : null;
  const urls: string[] = [];
  for (const index of indexes) {
    const raw = images[index];
    if (raw == null) continue;
    const src = toViewerSrc(raw);
    if (src && src !== currentSrc && !urls.includes(src)) urls.push(src);
  }
  return urls;
}
