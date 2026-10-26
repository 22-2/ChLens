import { DEFAULT_CONFIG } from "src/app/config-defaults";
import { createLogger } from "src/app/logger";
import { platform } from "src/app/platform";
import {
  BYTES_PER_MB,
  DEFAULT_IMAGE_AUTO_DOWNLOAD_LIMIT_MB,
  IMAGE_AUTO_DOWNLOAD_LIMIT_CONFIG_KEY,
} from "src/features/media/domain/media-settings";
import { readConfigValue } from "src/view/browser/utils/config-setting";

import { useMediaImageStore } from "./use-media-image-store";

const logger = createLogger("media");
const IMAGE_SIZE_CHECK_TIMEOUT_MS = 10_000;
const preflightRequests = new Map<string, { sourceUrl: string; promise: Promise<void> }>();

function getConfiguredMaxBytes(): number {
  try {
    const configuredValue =
      readConfigValue(IMAGE_AUTO_DOWNLOAD_LIMIT_CONFIG_KEY) ??
      DEFAULT_CONFIG[IMAGE_AUTO_DOWNLOAD_LIMIT_CONFIG_KEY];
    const parsedMegabytes = Number(configuredValue ?? DEFAULT_IMAGE_AUTO_DOWNLOAD_LIMIT_MB);
    const megabytes = Number.isFinite(parsedMegabytes)
      ? Math.max(1, parsedMegabytes)
      : DEFAULT_IMAGE_AUTO_DOWNLOAD_LIMIT_MB;
    return megabytes * BYTES_PER_MB;
  } catch (error) {
    logger.error("画像自動取得上限の読み込みに失敗しました", { error });
    return DEFAULT_IMAGE_AUTO_DOWNLOAD_LIMIT_MB * BYTES_PER_MB;
  }
}

function parseContentLength(headers: Record<string, string>): number | null {
  const rawValue = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "content-length",
  )?.[1];
  if (!rawValue || !/^\d+$/u.test(rawValue.trim())) return null;

  const contentLength = Number(rawValue);
  return Number.isFinite(contentLength) ? contentLength : Number.MAX_SAFE_INTEGER;
}

function formatImageSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < BYTES_PER_MB) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${(bytes / BYTES_PER_MB).toFixed(2)} MB`;
}

function buildImageWarning(contentLength: number | null, maxBytes: number): string {
  if (contentLength == null) {
    return "画像サイズを取得前に確認できませんでした。この画像を取得しますか？";
  }
  return `この画像は ${formatImageSize(contentLength)} で、設定上限 ${formatImageSize(maxBytes)} を超えています。取得しますか？`;
}

function isHttpUrl(url: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

async function startImagePreflight(key: string, sourceUrl: string): Promise<void> {
  const version = useMediaImageStore.getState().beginImageCheck(key, sourceUrl);
  if (version == null) return;

  const activeRequest = preflightRequests.get(key);
  if (activeRequest?.sourceUrl === sourceUrl) return activeRequest.promise;

  const promise = Promise.resolve()
    .then(() =>
      platform.http.fetch(sourceUrl, {
        method: "HEAD",
        headers: { Accept: "image/*" },
        timeout: IMAGE_SIZE_CHECK_TIMEOUT_MS,
      }),
    )
    .then((response) => {
      if (response.status < 200 || response.status >= 300) {
        logger.warn("画像サーバーの応答からサイズを確認できませんでした", {
          url: sourceUrl,
          status: response.status,
        });
        useMediaImageStore
          .getState()
          .setImagePreflightResult(key, sourceUrl, version, null, getConfiguredMaxBytes());
        return;
      }

      useMediaImageStore
        .getState()
        .setImagePreflightResult(
          key,
          sourceUrl,
          version,
          parseContentLength(response.headers),
          getConfiguredMaxBytes(),
        );
    })
    .catch((error: unknown) => {
      logger.error("画像サイズの事前確認に失敗しました", { url: sourceUrl, error });
      useMediaImageStore
        .getState()
        .setImagePreflightResult(key, sourceUrl, version, null, getConfiguredMaxBytes());
    })
    .finally(() => {
      if (preflightRequests.get(key)?.promise === promise) preflightRequests.delete(key);
    });

  preflightRequests.set(key, { sourceUrl, promise });
  return promise;
}

/** 画像取得の前にHEADでサイズを調べ、上限超過とサイズ不明だけ確認を求める。 */
export async function requestMediaImageDownload(
  key: string,
  sourceUrl: string,
  targetWindow: Window = window,
): Promise<void> {
  if (!isHttpUrl(sourceUrl)) {
    useMediaImageStore.getState().requestImage(key, sourceUrl);
    return;
  }

  const store = useMediaImageStore.getState();
  const current = store.images.get(key);
  const isCurrentSource = current?.sourceUrl === sourceUrl;
  if (isCurrentSource && (current.status === "requested" || current.status === "loaded")) return;
  if (isCurrentSource && current.status === "checking") {
    await preflightRequests.get(key)?.promise;
    return;
  }
  if (isCurrentSource && current.status === "awaiting-confirmation") {
    const maxBytes = getConfiguredMaxBytes();
    if (current.contentLength != null && current.contentLength <= maxBytes) {
      store.approveImage(key, current.version);
      return;
    }

    try {
      if (targetWindow.confirm(buildImageWarning(current.contentLength ?? null, maxBytes))) {
        store.approveImage(key, current.version);
      }
    } catch (error) {
      logger.error("画像取得の確認画面を表示できませんでした", { url: sourceUrl, error });
    }
    return;
  }

  await startImagePreflight(key, sourceUrl);
}

/** 設定上限を上げた場合、既知サイズが上限内になった警告画像を自動取得へ進める。 */
export function allowImageWithinCurrentLimit(key: string): void {
  const current = useMediaImageStore.getState().images.get(key);
  if (
    current?.status === "awaiting-confirmation" &&
    current.contentLength != null &&
    current.contentLength <= getConfiguredMaxBytes()
  ) {
    useMediaImageStore.getState().approveImage(key, current.version);
  }
}
