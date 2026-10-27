import { platformDownloadManager } from "src/app/platform/DownloadManager";
import { toOriginalImageUrl, toViewerImageUrl } from "src/core/util/url-media";

export function getImageDownloadFilename(url: string): string {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean).at(-1);
    if (segment) {
      // eslint-disable-next-line no-control-regex
      return segment.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    }
  } catch {
    // 不正なURLでも保存処理の失敗を呼び出し元へ返せるよう、名前だけ代替する。
  }
  return "image";
}

/** ビューアと同じ元画像を保存する。 */
export async function saveMediaImage(rawUrl: string): Promise<void> {
  const imageUrl = toViewerImageUrl(rawUrl) ?? rawUrl;
  const url = toOriginalImageUrl(imageUrl) ?? imageUrl;
  await platformDownloadManager.save(url, getImageDownloadFilename(url));
}
