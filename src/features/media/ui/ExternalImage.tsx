import "./ExternalImage.css";

import {
  forwardRef,
  type ImgHTMLAttributes,
  type SyntheticEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import { fetchTauriBinary } from "src/app/platform/tauri/HttpClient";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { useConfigNumberSetting } from "src/view/browser/hooks/use-config-number-setting";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

import {
  allowImageWithinCurrentLimit,
  requestMediaImageDownload,
} from "../browser/image-download-preflight";
import { useMediaImageStore } from "../browser/use-media-image-store";
import {
  DEFAULT_IMAGE_AUTO_DOWNLOAD_LIMIT_MB,
  IMAGE_AUTO_DOWNLOAD_LIMIT_CONFIG_KEY,
  MANUAL_IMAGE_LOADING_CONFIG_KEY,
} from "../domain/media-settings";
import {
  decideImageError,
  decidePreflight,
  type FallbackStatus,
  getExternalImagePlaceholderText,
  isHttpUrl,
  isStaleImageRequest,
  resolveRenderedSrc,
  shouldMarkImageLoaded,
} from "./external-image-state";

const logger = createLogger("media");

const EXTERNAL_IMAGE_TIMEOUT_MS = 30_000;

export type ExternalImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  /** クリック後の親画面ですでに明示的な取得操作が行われた場合は、設定より優先して自動取得する。 */
  manualLoad?: boolean;
  /**
   * 親がボタンやリンクの場合に指定する。取得前の表示をボタンにせず、操作を待つ状態以外のクリックは親へ任せる。
   * ボタンの中にボタンを置くと、HTMLとして不正なうえ、クリックがどちらに届くか利用者から分からないため。
   */
  insideControl?: boolean;
  "data-testid"?: string;
  "data-image-key"?: string;
};

function getResponseHeader(headers: Record<string, string>, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1];
}

async function fetchTauriImage(url: string): Promise<string> {
  const response = await fetchTauriBinary(url, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    timeout: EXTERNAL_IMAGE_TIMEOUT_MS,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`外部画像のHTTPステータスが不正です: ${response.status}`);
  }

  const contentType =
    getResponseHeader(response.headers, "content-type") ?? "application/octet-stream";
  return URL.createObjectURL(new Blob([response.body], { type: contentType }));
}

const fallbackImageRequests = new Map<string, { version: number; promise: Promise<string> }>();

function fetchSharedTauriImage(key: string, url: string, version: number): Promise<string> {
  const imageState = useMediaImageStore.getState().images.get(key);
  if (imageState?.fallbackSrc) return Promise.resolve(imageState.fallbackSrc);

  const activeRequest = fallbackImageRequests.get(key);
  if (activeRequest?.version === version) return activeRequest.promise;

  const promise = fetchTauriImage(url)
    .then((fallbackSrc) => {
      const cached = useMediaImageStore.getState().setFallbackSrc(key, version, fallbackSrc);
      if (!cached) {
        URL.revokeObjectURL(fallbackSrc);
        throw new Error("画像の取得状態が切り替わったため、古い取得結果を破棄しました");
      }
      return fallbackSrc;
    })
    .finally(() => {
      if (fallbackImageRequests.get(key)?.promise === promise) {
        fallbackImageRequests.delete(key);
      }
    });
  fallbackImageRequests.set(key, { version, promise });
  return promise;
}

/**
 * Tauri WebViewで外部画像の読み込みに失敗した場合だけ、Rust側HTTP経由のblob URLへ切り替える。
 * 通常のimg読み込みを先に試すことで、ブラウザのlazy loadingと既存のキャッシュ挙動を維持する。
 * 取得の判断は external-image-state の純粋な関数に任せ、ここではストア・通信・DOMへの作用だけを行う。
 */
export const ExternalImage = forwardRef<HTMLImageElement, ExternalImageProps>(
  function ExternalImage({ src, onError, onLoad, manualLoad, insideControl, ...props }, ref) {
    const { value: manualImageLoading } = useConfigBooleanSetting(MANUAL_IMAGE_LOADING_CONFIG_KEY);
    const { value: imageAutoDownloadLimitMb } = useConfigNumberSetting(
      IMAGE_AUTO_DOWNLOAD_LIMIT_CONFIG_KEY,
      DEFAULT_IMAGE_AUTO_DOWNLOAD_LIMIT_MB,
    );
    const { window: viewWindow } = useViewSurface();
    const shouldLoadManually = manualLoad ?? manualImageLoading;
    const imageKey = props["data-image-key"] ?? src;
    const imageState = useMediaImageStore((state) => state.images.get(imageKey));
    const requestVersion = imageState?.version ?? 0;
    const [sourceState, setSourceState] = useState<{ rawSrc: string; renderedSrc: string | null }>(
      () => ({
        rawSrc: src,
        renderedSrc: src,
      }),
    );
    const fallbackStatusRef = useRef<FallbackStatus>("idle");
    const requestVersionRef = useRef(0);
    const currentSrcRef = useRef(src);
    const placeholderRef = useRef<HTMLElement | null>(null);

    currentSrcRef.current = src;

    useEffect(() => {
      const decision = decidePreflight({
        manualLoad: shouldLoadManually,
        status: imageState?.status,
        lazy: props.loading === "lazy",
        canObserveVisibility: typeof IntersectionObserver !== "undefined",
      });
      if (decision === "none") return;
      if (decision === "allow-within-limit") {
        allowImageWithinCurrentLimit(imageKey);
        return;
      }

      const beginPreflight = () => {
        void requestMediaImageDownload(imageKey, src, viewWindow).catch((error: unknown) => {
          logger.error("画像サイズ確認の開始に失敗しました", { url: src, error });
        });
      };
      if (decision === "request-now") {
        beginPreflight();
        return;
      }

      const placeholder = placeholderRef.current;
      if (!placeholder) return;

      // 表示領域へ近づいてからサイズを確認する。ブラウザーのlazy loadingと同じ扱いにする。
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            beginPreflight();
          }
        },
        { rootMargin: "200px" },
      );
      observer.observe(placeholder);
      return () => observer.disconnect();
    }, [
      imageAutoDownloadLimitMb,
      imageKey,
      imageState?.status,
      props.loading,
      shouldLoadManually,
      src,
      viewWindow,
    ]);

    // WebViewではCSPエラーが通常のeffectより先に届くため、取得世代を描画直後に確定する。
    useLayoutEffect(() => {
      requestVersionRef.current += 1;
      fallbackStatusRef.current = "idle";
      setSourceState({ rawSrc: src, renderedSrc: src });

      return () => {
        // 同じURLへ戻った場合も、前の表示で始めた取得結果は引き継がない。
        requestVersionRef.current += 1;
      };
    }, [imageState?.version, src]);

    const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
      const currentSrcAttr = event.currentTarget.getAttribute("src");
      const cachedFallbackSrc = useMediaImageStore.getState().images.get(imageKey)?.fallbackSrc;
      const decision = decideImageError({
        currentSrcAttr,
        isCurrentSource: sourceState.rawSrc === src,
        fallbackStatus: fallbackStatusRef.current,
        isTauri: isTauriRuntime(),
        isHttp: isHttpUrl(src),
        failedCachedFallback: cachedFallbackSrc != null && currentSrcAttr === cachedFallbackSrc,
      });

      if (decision.action === "ignore") return;
      if (decision.action === "fail") {
        if (decision.reportCachedFailure) {
          logger.error("取得済みの外部画像を表示できませんでした", { url: src });
        }
        fallbackStatusRef.current = "failed";
        onError?.(event);
        return;
      }

      fallbackStatusRef.current = "pending";
      const componentRequestVersion = requestVersionRef.current;
      const imageRequestVersion = requestVersion;
      setSourceState({ rawSrc: src, renderedSrc: null });

      const isStale = () =>
        isStaleImageRequest(
          { src, componentRequestVersion, imageRequestVersion },
          {
            src: currentSrcRef.current,
            componentRequestVersion: requestVersionRef.current,
            imageVersion: useMediaImageStore.getState().images.get(imageKey)?.version ?? 0,
          },
        );

      void fetchSharedTauriImage(imageKey, src, imageRequestVersion)
        .then(() => {
          if (isStale()) return;
          fallbackStatusRef.current = "loaded";
        })
        .catch((error: unknown) => {
          if (isStale()) return;
          // WebView側とRust側の両方で失敗したURLを記録し、画像だけを黙って消さない。
          logger.error("Tauri経由の外部画像取得に失敗しました", {
            url: src,
            error,
          });
          fallbackStatusRef.current = "failed";
          setSourceState({ rawSrc: src, renderedSrc: src });
          onError?.(event);
        });
    };

    const isImageLoadStarted =
      imageState?.status === "requested" || imageState?.status === "loaded";
    if (imageState?.status === "discarded" || !isImageLoadStarted) {
      const alt = props.alt?.trim();
      const placeholderText = getExternalImagePlaceholderText({
        status: imageState?.status,
        contentLength: imageState?.contentLength,
        maxBytes: imageState?.maxBytes,
        manualLoad: shouldLoadManually,
      });
      const requestImage = () => {
        void requestMediaImageDownload(imageKey, src, viewWindow).catch((error: unknown) => {
          logger.error("画像取得の事前確認に失敗しました", { url: src, error });
        });
      };
      const placeholderProps = {
        ref: (node: HTMLElement | null) => {
          placeholderRef.current = node;
        },
        className: [
          "external-image-placeholder",
          imageState?.status === "discarded" ? "external-image-placeholder--deleted" : null,
          typeof props.className === "string" ? props.className : null,
        ]
          .filter(Boolean)
          .join(" "),
        style: {
          ...props.style,
          width: props.style?.width ?? props.width ?? "100%",
          height: props.style?.height ?? props.height ?? "100%",
        },
        title:
          imageState?.status === "discarded" ? placeholderText : (props.title ?? placeholderText),
        "data-testid": props["data-testid"],
        "data-image-key": props["data-image-key"],
      };
      if (insideControl) {
        // 確認待ちと削除済みは表示が「クリック」を案内しているため、ここで取得し親の操作を止める。
        // サイズ確認中などの受け身の状態は、親（ビューアを開くなど）の操作をそのまま通す。
        const isAwaitingUserAction =
          imageState?.status === "awaiting-confirmation" || imageState?.status === "discarded";
        return (
          <span
            {...placeholderProps}
            onClick={
              isAwaitingUserAction
                ? (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    requestImage();
                  }
                : undefined
            }
          >
            <span>{placeholderText}</span>
          </span>
        );
      }
      return (
        <button
          {...placeholderProps}
          type="button"
          aria-label={
            imageState?.status === "discarded"
              ? placeholderText
              : imageState?.status === "awaiting-confirmation"
                ? placeholderText
                : alt
                  ? `画像を読み込む: ${alt}`
                  : "画像を読み込む"
          }
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            requestImage();
          }}
        >
          <span>{placeholderText}</span>
        </button>
      );
    }

    const isCurrentSource = sourceState.rawSrc === src;
    const renderedSrc = resolveRenderedSrc({
      fallbackSrc: imageState?.fallbackSrc,
      isCurrentSource,
      renderedSrc: sourceState.renderedSrc,
    });
    return (
      <img
        {...props}
        ref={ref}
        src={renderedSrc ?? undefined}
        onError={handleError}
        onLoad={(event) => {
          if (
            shouldMarkImageLoaded({
              renderedSrc,
              isCurrentSource,
              eventSrcAttr: event.currentTarget.getAttribute("src"),
            })
          ) {
            useMediaImageStore.getState().markImageLoaded(imageKey, requestVersion);
            onLoad?.(event);
          }
        }}
      />
    );
  },
);
