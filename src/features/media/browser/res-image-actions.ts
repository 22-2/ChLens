import { useImageUnblurStore } from "./use-image-unblur-store";
import { useMediaImageStore } from "./use-media-image-store";

/**
 * レスの画像のうち、ぼかしの解除がまだ済んでいないもの。
 * ぼかしの有無そのものはレス単位の判定なので、呼び出し側が「このレスはぼかし中」と分かっているときに使う。
 */
export function filterStillBlurredImageUrls(urls: readonly string[]): string[] {
  const { unblurredKeys } = useImageUnblurStore.getState();
  return urls.filter((url) => !unblurredKeys.has(url));
}

/** レスの画像のうち、取得が済んで表示中のもの。破棄できる画像の絞り込みに使う。 */
export function filterLoadedImageUrls(urls: readonly string[]): string[] {
  const { images } = useMediaImageStore.getState();
  return urls.filter((url) => images.get(url)?.status === "loaded");
}

export function unblurImages(urls: readonly string[]): void {
  useImageUnblurStore.getState().unblurImages(urls);
}

/** 取得済みの画像をまとめて破棄し、破棄できた枚数を返す。 */
export function discardLoadedImages(urls: readonly string[]): number {
  const { discardImage } = useMediaImageStore.getState();
  return urls.filter((url) => discardImage(url)).length;
}
