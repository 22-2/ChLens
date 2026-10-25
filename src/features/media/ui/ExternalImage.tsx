import "./ExternalImage.css";

import {
  forwardRef,
  type ImgHTMLAttributes,
  type SyntheticEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import { fetchTauriBinary } from "src/app/platform/tauri/HttpClient";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";

import { MANUAL_IMAGE_LOADING_CONFIG_KEY } from "../domain/media-settings";

const logger = createLogger("media");

const EXTERNAL_IMAGE_TIMEOUT_MS = 30_000;

export type ExternalImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  /** クリック後の親画面ですでに明示的な取得操作が行われた場合は、設定より優先して自動取得する。 */
  manualLoad?: boolean;
  "data-testid"?: string;
  "data-image-key"?: string;
};

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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

/**
 * Tauri WebViewで外部画像の読み込みに失敗した場合だけ、Rust側HTTP経由のblob URLへ切り替える。
 * 通常のimg読み込みを先に試すことで、ブラウザのlazy loadingと既存のキャッシュ挙動を維持する。
 */
export const ExternalImage = forwardRef<HTMLImageElement, ExternalImageProps>(
  function ExternalImage({ src, onError, onLoad, manualLoad, ...props }, ref) {
    const { value: manualImageLoading } = useConfigBooleanSetting(MANUAL_IMAGE_LOADING_CONFIG_KEY);
    const shouldLoadManually = manualLoad ?? manualImageLoading;
    const [isLoadRequested, setIsLoadRequested] = useState(() => !shouldLoadManually);
    const [sourceState, setSourceState] = useState<{ rawSrc: string; renderedSrc: string | null }>(
      () => ({
        rawSrc: src,
        renderedSrc: src,
      }),
    );
    const fallbackStatusRef = useRef<"idle" | "pending" | "loaded" | "failed">("idle");
    const requestVersionRef = useRef(0);
    const currentSrcRef = useRef(src);
    const objectUrlRef = useRef<string | null>(null);

    currentSrcRef.current = src;

    // WebViewではCSPエラーが通常のeffectより先に届くため、取得世代を描画直後に確定する。
    useLayoutEffect(() => {
      requestVersionRef.current += 1;
      fallbackStatusRef.current = "idle";
      setSourceState({ rawSrc: src, renderedSrc: src });
      setIsLoadRequested(!shouldLoadManually);

      return () => {
        // 同じURLへ戻った場合も、前の表示で始めた取得結果は引き継がない。
        requestVersionRef.current += 1;
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      };
    }, [shouldLoadManually, src]);

    const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
      // src切替・フォールバック待機のために属性を外した際のエラーは、読込失敗ではない。
      if (!event.currentTarget.getAttribute("src") || sourceState.rawSrc !== src) return;
      if (fallbackStatusRef.current === "pending" || fallbackStatusRef.current === "failed") return;

      if (!isTauriRuntime() || !isHttpUrl(src) || fallbackStatusRef.current === "loaded") {
        if (fallbackStatusRef.current === "loaded") {
          logger.error("取得済みの外部画像を表示できませんでした", { url: src });
        }
        fallbackStatusRef.current = "failed";
        onError?.(event);
        return;
      }

      fallbackStatusRef.current = "pending";
      const requestVersion = requestVersionRef.current;
      setSourceState({ rawSrc: src, renderedSrc: null });

      void fetchTauriImage(src)
        .then((objectUrl) => {
          if (currentSrcRef.current !== src || requestVersionRef.current !== requestVersion) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          objectUrlRef.current = objectUrl;
          fallbackStatusRef.current = "loaded";
          setSourceState({ rawSrc: src, renderedSrc: objectUrl });
        })
        .catch((error: unknown) => {
          // WebView側とRust側の両方で失敗したURLを記録し、画像だけを黙って消さない。
          logger.error("Tauri経由の外部画像取得に失敗しました", {
            url: src,
            error,
          });
          if (currentSrcRef.current !== src || requestVersionRef.current !== requestVersion) {
            return;
          }
          fallbackStatusRef.current = "failed";
          setSourceState({ rawSrc: src, renderedSrc: src });
          onError?.(event);
        });
    };

    if (shouldLoadManually && !isLoadRequested) {
      const alt = props.alt?.trim();
      return (
        <button
          type="button"
          className={[
            "external-image-placeholder",
            typeof props.className === "string" ? props.className : null,
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            ...props.style,
            width: props.style?.width ?? props.width ?? "100%",
            height: props.style?.height ?? props.height ?? "100%",
          }}
          title={props.title ?? "クリックして画像を取得"}
          aria-label={alt ? `画像を読み込む: ${alt}` : "画像を読み込む"}
          data-testid={props["data-testid"]}
          data-image-key={props["data-image-key"]}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsLoadRequested(true);
          }}
        >
          <span>クリックして画像を取得</span>
        </button>
      );
    }

    const renderedSrc = sourceState.rawSrc === src ? sourceState.renderedSrc : null;
    return (
      <img
        {...props}
        ref={ref}
        src={renderedSrc ?? undefined}
        onError={handleError}
        onLoad={(event) => {
          if (
            renderedSrc !== null &&
            sourceState.rawSrc === src &&
            event.currentTarget.getAttribute("src") === renderedSrc
          ) {
            onLoad?.(event);
          }
        }}
      />
    );
  },
);
