import { createLogger } from "src/app/logger";

import { requestMediaImageDownload } from "../browser/image-download-preflight";
import type { MediaImageState, MediaImageStatus } from "../browser/use-media-image-store";

const logger = createLogger("media");

export function requestImageDownload(url: string): void {
  void requestMediaImageDownload(url, url).catch((error: unknown) => {
    logger.error("画像取得の事前確認に失敗しました", { url, error });
  });
}

export function getImagePlaceholderText(imageState: MediaImageState | undefined): string {
  if (imageState?.status === "discarded") return "削除されました";
  if (imageState?.status === "checking") return "画像サイズを確認中...";
  if (imageState?.status === "awaiting-confirmation") {
    if (imageState.contentLength == null) return "サイズを確認できません。クリックして確認";
    return `画像サイズ ${(imageState.contentLength / 1_000_000).toFixed(2)} MB・クリックして確認`;
  }
  return "クリックして画像を取得";
}

export function getImagePlaceholderLabel(
  imageState: MediaImageState | undefined,
  defaultLabel: string,
): string {
  if (imageState?.status === "discarded") return "削除されました";
  if (imageState?.status === "checking") return "画像サイズを確認中";
  if (imageState?.status === "awaiting-confirmation") {
    return getImagePlaceholderText(imageState);
  }
  return defaultLabel;
}

export function isImageLoadStarted(status: MediaImageStatus | undefined): boolean {
  return status === "requested" || status === "loaded";
}
