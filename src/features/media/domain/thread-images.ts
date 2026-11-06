import { isDirectVideoUrl } from "src/core/util/external-media";
import { stripHtml } from "src/core/util/strip-html";
import { extractUrlsFromMessage, toViewerImageUrl } from "src/core/util/url-media";
import type { IRes } from "src/service-container/interfaces";
import { decodeResponseMessageHtml } from "src/view/browser/utils/response-format";

export interface ThreadImageItem {
  resNum: number;
  /** 本文中の URL。画像の取得状態とビューアーはこの URL を鍵にする。 */
  rawUrl: string;
  /** サムネイルとして表示する URL。 */
  src: string;
  text: string;
}

// 自動更新のたびに全レスの HTML を解析し直さないよう、レスごとに取り出した URL を覚える。
const urlCache = new WeakMap<IRes, { protocol: string; urls: string[] }>();
// 変更理由: NG判定などでレスのオブジェクトが作り直されると、本文が同じでも上のキャッシュが外れ、
// 1000レスのスレで全レスのサニタイズをやり直していた。本文の文字列でも覚えて、作り直しに耐える。
const MESSAGE_URL_CACHE_LIMIT = 5000;
const messageUrlCache = new Map<string, string[]>();

function getResUrls(res: IRes, protocol: string): string[] {
  const cached = urlCache.get(res);
  if (cached?.protocol === protocol) return cached.urls;
  const key = `${protocol}\0${res.message}`;
  let urls = messageUrlCache.get(key);
  if (!urls) {
    urls = extractUrlsFromMessage(decodeResponseMessageHtml(res.message || "", protocol));
    // 上限を超えたら全部捨てる。再計算は安価で、古い順の管理より単純で確実。
    if (messageUrlCache.size >= MESSAGE_URL_CACHE_LIMIT) messageUrlCache.clear();
    messageUrlCache.set(key, urls);
  }
  urlCache.set(res, { protocol, urls });
  return urls;
}

/**
 * 本文の添付と同じ判定で画像を集める。動画や埋め込みは含めず、
 * 同じ URL は最初に貼られたレスだけに出す。
 */
export function collectThreadImages(
  responses: readonly IRes[],
  protocol: string,
): ThreadImageItem[] {
  const seen = new Set<string>();
  const items: ThreadImageItem[] = [];
  for (const res of responses) {
    for (const rawUrl of getResUrls(res, protocol)) {
      if (seen.has(rawUrl) || isDirectVideoUrl(rawUrl)) continue;
      const src = toViewerImageUrl(rawUrl);
      if (!src) continue;
      seen.add(rawUrl);
      items.push({ resNum: res.num, rawUrl, src, text: stripHtml(res.message) });
    }
  }
  return items;
}

/**
 * 1つのレスの本文から、添付のサムネイルとして表示する画像のURLを返す。
 * ResMediaGalleryが画像の鍵（data-image-key）に使うURLと同じになる。
 * collectThreadImagesと違い、ほかのレスに同じURLがあっても除かない（レスごとの判定に使うため）。
 * Imgurアルバムの中の画像は、取得してから決まるため含まない。
 */
export function collectResImageUrls(res: IRes, protocol: string): string[] {
  const urls = getResUrls(res, protocol).filter(
    (rawUrl) => !isDirectVideoUrl(rawUrl) && toViewerImageUrl(rawUrl) != null,
  );
  return [...new Set(urls)];
}
