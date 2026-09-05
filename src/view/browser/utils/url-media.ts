export { extractUrlsFromMessage, toViewerImageUrl } from "@chlen/ch-lib";

/**
 * レス本文からのURL抽出と画像ビューア向けURL変換をまとめる。
 * URLの復元・抽出・Imgur変換は同じ正規化規則を共有するため、メディア判定やDOM操作から
 * 分離した一つの境界に置いて、表示側がURL処理の詳細へ依存しないようにする。
 */

export function buildKyodemoUrl(threadUrl: string, rawId: string): string | null {
  try {
    const urlObj = new window.URL(threadUrl);
    const pathParts = urlObj.pathname.split("/");
    const board = pathParts[3];
    const key = pathParts[4];
    if (!board || !key) return null;

    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}${mm}${dd}`;

    return `https://www.kyodemo.net/sdemo/b/e_e_${board}/?hi=${encodeURIComponent(
      rawId,
    )}&key=${encodeURIComponent(key)}&date=${dateStr}`;
  } catch {
    return null;
  }
}

/**
 * imgurのリサイズパラメータ付きサムネイルURLから、オリジナル解像度のURLを返す。
 * リサイズパラメータ（m など）が付いていない場合は null を返す。
 */
export function toOriginalImageUrl(thumbnailUrl: string): string | null {
  try {
    const url = new window.URL(thumbnailUrl);
    if (url.hostname.toLowerCase() !== "i.imgur.com") return null;
    // /[id]m.jpg のパターンからリサイズパラメータを除去してオリジナルURLを生成
    const match = url.pathname.match(/^\/([a-z0-9]+)m\.([a-z]+)$/i);
    if (!match) return null;
    const [, id, ext] = match;
    return `https://i.imgur.com/${id}.${ext}`;
  } catch {
    return null;
  }
}
