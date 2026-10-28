import { parseMessage } from "@chlen/chlib";
import { Download, Maximize2, Minimize2, MoveDiagonal2, Trash2 } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import {
  type ExternalMediaEmbed,
  getDirectVideoFallbackThumbnailUrl,
  getDirectVideoLabel,
  isDirectVideoUrl,
  shouldOpenYouTubeExternally,
  toInlineVideoEmbed,
  toRuntimeVideoEmbedUrl,
  toTwitterPostEmbed,
} from "src/core/util/external-media";
import { toOriginalImageUrl, toViewerImageUrl } from "src/core/util/url-media";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { useExternalLinkMenu } from "src/view/browser/hooks/use-external-link-menu";
import { ConfirmableLink } from "src/view/browser/ui/ConfirmableLink";
import { Spinner } from "src/view/browser/ui/Spinner";
import { requestExternalLink } from "src/view/browser/utils/external-link";
import { EXTERNAL_LINK_CONFIRM_CONFIG_KEY } from "src/view/browser/utils/external-link-analysis";
import type { UrlHandlingMode } from "src/view/browser/utils/link-routing";

import { imgurVideoResolver, isImgurVideoResolutionCandidate } from "../application/imgur-album";
import {
  type TwitterPost,
  type TwitterPostMetrics,
  twitterPostResolver,
  type TwitterVerificationBadgeColor,
} from "../application/twitter-post";
import { requestMediaImageDownload } from "../browser/image-download-preflight";
import { collectImageMenuItems } from "../browser/image-menu-contributions";
import { isImageHashPending, useImageHashStore } from "../browser/use-image-hash-store";
import { useImageSave } from "../browser/use-image-save";
import {
  type MediaImageState,
  type MediaImageStatus,
  useMediaImageStore,
} from "../browser/use-media-image-store";
import { MANUAL_IMAGE_LOADING_CONFIG_KEY } from "../domain/media-settings";
import { ExternalImage } from "./ExternalImage";

const logger = createLogger("media");

function requestImageDownload(url: string): void {
  void requestMediaImageDownload(url, url).catch((error: unknown) => {
    logger.error("画像取得の事前確認に失敗しました", { url, error });
  });
}

function getImagePlaceholderText(imageState: MediaImageState | undefined): string {
  if (imageState?.status === "discarded") return "削除されました";
  if (imageState?.status === "checking") return "画像サイズを確認中...";
  if (imageState?.status === "awaiting-confirmation") {
    if (imageState.contentLength == null) return "サイズを確認できません。クリックして確認";
    return `画像サイズ ${(imageState.contentLength / 1_000_000).toFixed(2)} MB・クリックして確認`;
  }
  return "クリックして画像を取得";
}

function getImagePlaceholderLabel(
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

type ManualLoadExternalImageProps = React.ComponentProps<typeof ExternalImage> & {
  containerClassName?: string;
  errorLabel?: string;
};

/** 手動取得を選んだ画像は、読み込み完了まで同じ枠内に状態を表示する。 */
function ManualLoadExternalImage({
  containerClassName,
  errorLabel = "画像の取得に失敗しました",
  onLoad,
  onError,
  ...imageProps
}: ManualLoadExternalImageProps): React.ReactElement {
  const [loadState, setLoadState] = useState<{
    src: string;
    state: "loading" | "loaded" | "error";
  }>(() => ({ src: imageProps.src, state: "loading" }));
  const currentLoadState = loadState.src === imageProps.src ? loadState.state : "loading";

  return (
    <span className={`res__manual-image-load${containerClassName ? ` ${containerClassName}` : ""}`}>
      <ExternalImage
        {...imageProps}
        manualLoad={false}
        onLoad={(event) => {
          setLoadState({ src: imageProps.src, state: "loaded" });
          onLoad?.(event);
        }}
        onError={(event) => {
          logger.error("手動取得した画像を表示できませんでした", { url: imageProps.src });
          setLoadState({ src: imageProps.src, state: "error" });
          onError?.(event);
        }}
      />
      {currentLoadState === "loading" ? (
        <span className="res__manual-image-load__status" role="status" aria-label="画像を取得中">
          <Spinner size="sm" aria-hidden="true" />
          <span>取得中</span>
        </span>
      ) : currentLoadState === "error" ? (
        <span className="res__manual-image-load__status" role="status">
          {errorLabel}
        </span>
      ) : null}
    </span>
  );
}

/** 元画像の読み込み中と失敗を同じ展開位置に表示する。 */
function InlineExpandedImage({
  src,
  imageKey,
  isBlurred,
  blurStyle,
  onClose,
  onOpenViewer,
  width,
  onResize,
  onContextMenu,
  onLoad,
  onError,
}: {
  src: string;
  imageKey: string;
  isBlurred: boolean;
  blurStyle: ThumbStyle;
  onClose: () => void;
  onOpenViewer: () => void;
  width?: number;
  onResize?: (width: number) => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  onError: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [previewWidth, setPreviewWidth] = useState<number>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    width: number;
    ratio: number;
    min: number;
    max: number;
    current: number;
  } | null>(null);
  const displayedWidth = previewWidth ?? width;

  const getBounds = () => {
    const wrapper = wrapperRef.current;
    const image = wrapper?.querySelector("img");
    const parent = wrapper?.parentElement;
    if (!wrapper || !image || !parent) return null;
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const paddingRight = parseFloat(getComputedStyle(parent).paddingRight) || 0;
    const max = Math.max(
      1,
      parent.getBoundingClientRect().right - wrapper.getBoundingClientRect().left - paddingRight,
    );
    return {
      width: rect.width,
      ratio: rect.width / rect.height,
      min: Math.min(96, rect.width, max),
      max,
    };
  };
  const clampWidth = (value: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(max, value)));
  // ドラッグ中は局所的に描画し、確定時だけ親へ渡して仮想化後も幅を保つ。
  const updateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const inverseRatio = 1 / drag.ratio;
    const delta =
      (event.clientX - drag.x + (event.clientY - drag.y) * inverseRatio) /
      (1 + inverseRatio * inverseRatio);
    drag.current = clampWidth(drag.width + delta, drag.min, drag.max);
    setPreviewWidth(drag.current);
  };
  return (
    <div
      ref={wrapperRef}
      className={`res__inline-image${displayedWidth != null ? " res__inline-image--resized" : ""}${isBlurred ? " res__thumb--blurred" : ""}`}
      style={{ ...(isBlurred ? blurStyle : undefined), width: displayedWidth }}
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        className="res__inline-image-content"
        aria-label="画像を折りたたむ"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <ExternalImage
          src={src}
          data-image-key={imageKey}
          alt={imageKey}
          manualLoad={false}
          insideControl
          onLoad={(event) => {
            setStatus("loaded");
            onLoad(event);
          }}
          onError={() => {
            setStatus("error");
            logger.error("展開した画像を表示できませんでした", { url: imageKey });
            onError();
          }}
        />
        {status === "loading" && <span role="status">画像を読み込み中…</span>}
        {status === "error" && <span role="status">画像を表示できません。クリックして閉じる</span>}
      </button>
      <div className="res__inline-image-actions">
        <button
          type="button"
          aria-label="ビューアで開く"
          title="ビューアで開く"
          onClick={(event) => {
            event.stopPropagation();
            onOpenViewer();
          }}
        >
          <Maximize2 size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="画像を縮小"
          title="画像を縮小"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <Minimize2 size={16} aria-hidden="true" />
        </button>
      </div>
      {status === "loaded" && onResize && (
        <button
          type="button"
          className="res__inline-image-resize"
          aria-label="画像のサイズを変更"
          title="ドラッグまたは矢印キーで画像のサイズを変更"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const bounds = getBounds();
            if (!bounds) return;
            event.preventDefault();
            event.stopPropagation();
            dragRef.current = {
              ...bounds,
              x: event.clientX,
              y: event.clientY,
              current: bounds.width,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => updateDrag(event)}
          onPointerUp={(event) => {
            if (!dragRef.current) return;
            updateDrag(event);
            const next = dragRef.current.current;
            dragRef.current = null;
            setPreviewWidth(undefined);
            onResize(next);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            setPreviewWidth(undefined);
          }}
          onLostPointerCapture={() => {
            dragRef.current = null;
            setPreviewWidth(undefined);
          }}
          onKeyDown={(event) => {
            const direction =
              event.key === "ArrowRight" || event.key === "ArrowUp"
                ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowDown"
                  ? -1
                  : 0;
            if (!direction) return;
            const bounds = getBounds();
            if (!bounds) return;
            event.preventDefault();
            event.stopPropagation();
            onResize(clampWidth(bounds.width + direction * 20, bounds.min, bounds.max));
          }}
        >
          <MoveDiagonal2 size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ギャラリーはThreadViewやPopupのURLルーティング実装を知らず、クリック時の引数だけを契約にする。
export type MediaUrlClickHandler = (
  url: string,
  resImages?: string[],
  button?: 0 | 1,
  mode?: UrlHandlingMode,
  resSaveImages?: string[],
) => boolean | void;

interface ResMediaGalleryProps {
  urls: string[];
  onUrlClick: MediaUrlClickHandler;
  onMiddleClickStart?: () => void;
  openOnMiddleMouseDown?: boolean;
  isBlurred?: boolean;
  imageBlurRadius?: number;
  expandedImageUrls?: ReadonlySet<string>;
  inlineImageWidths?: ReadonlyMap<string, number>;
  onResizeImage?: (url: string, width: number) => void;
  onToggleImage?: (url: string) => void;
  onOpenDetachedImage?: (url: string, images: string[], saveImages: string[]) => void;
}

type ThumbStyle = React.CSSProperties & {
  "--res-thumb-blur-radius"?: string;
};

function renderTwitterPostText(text: string): React.ReactNode[] {
  return parseMessage(text, { protocol: "https:" }).map((token, index) => {
    const key = `${index}-${token.type}`;
    if (token.type === "url") {
      return (
        <ConfirmableLink key={key} href={token.href} target="_blank" rel="noopener noreferrer">
          {token.value}
        </ConfirmableLink>
      );
    }

    // 変更理由: URL解析は掲示板本文と共通化しつつ、FxTwitter由来のタグはHTMLとして実行しない。
    return <React.Fragment key={key}>{token.value}</React.Fragment>;
  });
}

interface ImageMediaItem {
  type: "image";
  rawUrl: string;
  src: string;
}

interface EmbedMediaItem {
  type: "embed";
  embed: ExternalMediaEmbed;
}

interface NativeVideoMediaItem {
  type: "nativeVideo";
  rawUrl: string;
  srcUrl: string;
  providerLabel: string;
}

type ResMediaItem = ImageMediaItem | EmbedMediaItem | NativeVideoMediaItem;

const compactMetricFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const fullMetricFormatter = new Intl.NumberFormat("ja-JP");
const twitterPostDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const twitterPostWeekdayFormatter = new Intl.DateTimeFormat("ja-JP", { weekday: "long" });
const twitterPostTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// APIは古い投稿の閲覧数などをnullで返すため、0件は表示しつつ未提供項目だけを隠す。
const twitterMetricDefinitions: readonly {
  key: keyof TwitterPostMetrics;
  icon: string;
  label: string;
}[] = [
  { key: "replies", icon: "💬", label: "返信" },
  { key: "reposts", icon: "🔁", label: "リポスト" },
  { key: "quotes", icon: "❝", label: "引用" },
  { key: "likes", icon: "♥", label: "いいね" },
  { key: "views", icon: "👁", label: "閲覧" },
  { key: "bookmarks", icon: "🔖", label: "ブックマーク" },
];

const verificationBadgeLabels: Record<TwitterVerificationBadgeColor, string> = {
  blue: "青色の認証バッジ",
  gold: "金色の認証バッジ",
  gray: "灰色の認証バッジ",
};

function formatTwitterPostDate(createdTimestamp: number | null): string | null {
  if (createdTimestamp == null) return null;

  const date = new Date(createdTimestamp * 1_000);
  if (Number.isNaN(date.getTime())) return null;

  return `${twitterPostDateFormatter.format(date)} ${twitterPostWeekdayFormatter.format(date)} ${twitterPostTimeFormatter.format(date)}`;
}

function isImageLoadStarted(status: MediaImageStatus | undefined): boolean {
  return status === "requested" || status === "loaded";
}

function buildResMediaItem(rawUrl: string, resolvedVideoUrl?: string): ResMediaItem | null {
  // ImgurのMP4直リンクをサムネイル変換より先に動画として認識する。
  if (resolvedVideoUrl || isDirectVideoUrl(rawUrl)) {
    const srcUrl = resolvedVideoUrl ?? rawUrl;
    return {
      type: "nativeVideo",
      rawUrl,
      srcUrl,
      providerLabel: getDirectVideoLabel(srcUrl),
    };
  }

  const imageUrl = toViewerImageUrl(rawUrl);
  if (imageUrl) return { type: "image", rawUrl, src: imageUrl };

  const videoEmbed = toInlineVideoEmbed(rawUrl);
  if (videoEmbed) {
    return {
      type: "embed",
      embed: videoEmbed,
    };
  }

  const twitterEmbed = toTwitterPostEmbed(rawUrl);
  if (twitterEmbed) {
    return {
      type: "embed",
      embed: twitterEmbed,
    };
  }

  return null;
}

function VideoThumbImage({
  embed,
  manualImageLoading,
}: {
  embed: ExternalMediaEmbed;
  manualImageLoading: boolean;
}): React.ReactElement {
  const [posterUrl, setPosterUrl] = useState(embed.thumbnailUrl);

  useEffect(() => {
    setPosterUrl(embed.thumbnailUrl);
  }, [embed.thumbnailUrl]);

  if (manualImageLoading) {
    return <span className="res__thumb-video-manual-placeholder">クリックして動画を展開</span>;
  }

  return (
    <ExternalImage
      src={posterUrl}
      alt={`${embed.providerLabel} のサムネイル`}
      loading="lazy"
      manualLoad={false}
      insideControl
      onError={() => {
        if (posterUrl !== embed.fallbackThumbnailUrl) {
          setPosterUrl(embed.fallbackThumbnailUrl);
        }
      }}
    />
  );
}

function TwitterPostCard({
  embed,
  post,
  manualImageLoading,
  resSaveImages,
  onUrlClick,
  onMiddleMouseDown,
  onAuxClick,
  onImageContextMenu,
}: {
  embed: ExternalMediaEmbed;
  post: TwitterPost;
  manualImageLoading: boolean;
  resSaveImages: string[];
  onUrlClick: MediaUrlClickHandler;
  onMiddleMouseDown: (
    event: React.MouseEvent<HTMLElement>,
    url: string,
    resImages: string[] | undefined,
  ) => void;
  onAuxClick: (
    event: React.MouseEvent<HTMLElement>,
    url: string,
    resImages: string[] | undefined,
  ) => void;
  onImageContextMenu: (url: string, event: React.MouseEvent<HTMLElement>) => void;
}): React.ReactElement {
  // 変更理由: FxTwitterが返す写真も同じレス内の画像として扱い、専ブラの画像ビューアで前後移動できるようにする。
  const imageUrls = post.media
    .filter(
      (media): media is Extract<(typeof post.media)[number], { type: "image" }> =>
        media.type === "image",
    )
    .map((media) => media.url);
  const imageStates = useMediaImageStore((state) => state.images);
  const initialJapaneseTranslation =
    post.translation?.targetLang.toLowerCase() === "ja" ? post.translation : null;
  const [translation, setTranslation] = useState(initialJapaneseTranslation);
  const [isTranslationShown, setIsTranslationShown] = useState(initialJapaneseTranslation != null);
  const [isTranslationLoading, setIsTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState(false);
  const avatarUrl = post.author.avatarUrl;
  const avatarImageState = avatarUrl ? imageStates.get(avatarUrl) : undefined;
  const sourceLang = post.lang?.toLowerCase() ?? "";
  const canTranslateToJapanese =
    initialJapaneseTranslation != null ||
    (sourceLang !== "" && sourceLang !== "ja" && !sourceLang.startsWith("ja-"));
  const createdAt = formatTwitterPostDate(post.createdTimestamp);
  const createdAtIso =
    createdAt == null || post.createdTimestamp == null
      ? null
      : new Date(post.createdTimestamp * 1_000).toISOString();
  const visibleMetrics = twitterMetricDefinitions.filter(({ key }) => post.metrics[key] != null);

  const toggleTranslation = async () => {
    if (isTranslationShown) {
      setIsTranslationShown(false);
      return;
    }

    if (translation) {
      setIsTranslationShown(true);
      return;
    }

    setIsTranslationLoading(true);
    setTranslationError(false);
    try {
      const result = await twitterPostResolver.translate(embed.rawUrl, "ja");
      if (result) {
        setTranslation(result);
        setIsTranslationShown(true);
      } else {
        setTranslationError(true);
      }
    } finally {
      setIsTranslationLoading(false);
    }
  };

  return (
    <div className="res__twitter-post">
      <div className="res__twitter-post-author">
        {avatarUrl &&
          (avatarImageState?.status === "discarded" ||
          (manualImageLoading && !isImageLoadStarted(avatarImageState?.status)) ? (
            <button
              type="button"
              className="res__twitter-post-avatar-placeholder"
              aria-label={getImagePlaceholderLabel(avatarImageState, "投稿者の画像を読み込む")}
              onContextMenu={(event) => onImageContextMenu(avatarUrl, event)}
              onClick={() => requestImageDownload(avatarUrl)}
            >
              {getImagePlaceholderText(avatarImageState)}
            </button>
          ) : manualImageLoading ? (
            <ManualLoadExternalImage
              containerClassName="res__manual-image-load--avatar"
              errorLabel="×"
              className="res__twitter-post-avatar"
              src={avatarUrl}
              data-image-key={avatarUrl}
              alt=""
              loading="lazy"
              onContextMenu={(event) => onImageContextMenu(avatarUrl, event)}
            />
          ) : (
            <ExternalImage
              className="res__twitter-post-avatar"
              src={avatarUrl}
              data-image-key={avatarUrl}
              alt=""
              loading="lazy"
              manualLoad={false}
              onContextMenu={(event) => onImageContextMenu(avatarUrl, event)}
            />
          ))}
        <div className="res__twitter-post-author-text">
          <div className="res__twitter-post-author-name">
            <ConfirmableLink href={embed.externalUrl} target="_blank" rel="noopener noreferrer">
              {post.author.name}
            </ConfirmableLink>
            {post.author.verificationBadge && (
              <span
                className={`res__twitter-post-verification res__twitter-post-verification--${post.author.verificationBadge.color}`}
                role="img"
                aria-label={verificationBadgeLabels[post.author.verificationBadge.color]}
                title={verificationBadgeLabels[post.author.verificationBadge.color]}
              >
                ✓
              </span>
            )}
          </div>
          {post.author.screenName && (
            <span className="res__twitter-post-screen-name">@{post.author.screenName}</span>
          )}
        </div>
      </div>
      {post.text && (
        <p className="res__twitter-post-text">
          {renderTwitterPostText(isTranslationShown && translation ? translation.text : post.text)}
        </p>
      )}
      {visibleMetrics.length > 0 && (
        <div className="res__twitter-post-metrics" aria-label="投稿の反応数">
          {visibleMetrics.map(({ key, icon, label }) => {
            const value = post.metrics[key];
            if (value == null) return null;

            const accessibleLabel = `${label} ${fullMetricFormatter.format(value)}件`;
            return (
              <span
                key={key}
                className="res__twitter-post-metric"
                data-metric={key}
                aria-label={accessibleLabel}
                title={accessibleLabel}
              >
                <span className="res__twitter-post-metric-icon" aria-hidden="true">
                  {icon}
                </span>
                {compactMetricFormatter.format(value)}
              </span>
            );
          })}
        </div>
      )}
      {post.media.length > 0 && (
        <div className="res__twitter-post-media">
          {post.media.map((media, index) => {
            if (media.type === "image") {
              const imageState = imageStates.get(media.url);
              if (
                imageState?.status === "discarded" ||
                (manualImageLoading && !isImageLoadStarted(imageState?.status))
              ) {
                return (
                  <button
                    key={`${media.type}:${media.url}`}
                    type="button"
                    className="res__twitter-post-media-placeholder"
                    aria-label={getImagePlaceholderLabel(
                      imageState,
                      `${media.altText ?? "投稿画像"}を読み込む`,
                    )}
                    onContextMenu={(event) => onImageContextMenu(media.url, event)}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      requestImageDownload(media.url);
                    }}
                  >
                    {getImagePlaceholderText(imageState)}
                  </button>
                );
              }

              return (
                <ConfirmableLink
                  key={`${media.type}:${media.url}`}
                  href={media.url}
                  onContextMenu={(event) => onImageContextMenu(media.url, event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onUrlClick(media.url, imageUrls, 0, undefined, resSaveImages);
                  }}
                  onMouseDown={(event) => onMiddleMouseDown(event, media.url, imageUrls)}
                  onAuxClick={(event) => onAuxClick(event, media.url, imageUrls)}
                >
                  {manualImageLoading ? (
                    <ManualLoadExternalImage
                      src={media.url}
                      data-image-key={media.url}
                      alt={media.altText ?? "投稿画像"}
                      loading="lazy"
                      insideControl
                    />
                  ) : (
                    <ExternalImage
                      src={media.url}
                      data-image-key={media.url}
                      alt={media.altText ?? "投稿画像"}
                      loading="lazy"
                      manualLoad={false}
                      insideControl
                    />
                  )}
                </ConfirmableLink>
              );
            }

            return (
              <video
                key={`${media.type}:${media.url}:${index}`}
                src={media.url}
                poster={media.posterUrl ?? undefined}
                controls
                autoPlay={media.isGif}
                loop={media.isGif}
                muted={media.isGif}
                playsInline
                preload="metadata"
              />
            );
          })}
        </div>
      )}
      <div className="res__twitter-post-footer">
        <span>FxTwitter</span>
        {post.source && <span>{post.source}</span>}
        {createdAt && createdAtIso && <time dateTime={createdAtIso}>{createdAt}</time>}
        {canTranslateToJapanese && (
          <button
            className="res__twitter-post-translation"
            type="button"
            onClick={() => void toggleTranslation()}
            disabled={isTranslationLoading}
          >
            {isTranslationLoading
              ? "翻訳中…"
              : isTranslationShown
                ? "原文を表示"
                : "日本語訳を表示"}
          </button>
        )}
        <ConfirmableLink
          className="res__twitter-post-external"
          href={embed.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Xで投稿を開く
        </ConfirmableLink>
        {translationError && <span role="status">日本語訳を取得できませんでした</span>}
      </div>
    </div>
  );
}

function TwitterPostFallback({
  embed,
  isLoading,
}: {
  embed: ExternalMediaEmbed;
  isLoading: boolean;
}): React.ReactElement {
  return (
    <div className="res__twitter-post-fallback">
      <p>
        {isLoading
          ? "FxTwitterから投稿を取得しています…"
          : "FxTwitterから投稿を取得できませんでした"}
      </p>
      <ConfirmableLink href={embed.externalUrl} target="_blank" rel="noopener noreferrer">
        元の投稿を開く
      </ConfirmableLink>
    </div>
  );
}

function NativeVideoThumb({
  video,
  manualImageLoading,
}: {
  video: NativeVideoMediaItem;
  manualImageLoading: boolean;
}): React.ReactElement {
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const fallbackPosterUrl = getDirectVideoFallbackThumbnailUrl();

  return (
    <>
      {!isPreviewReady &&
        (manualImageLoading ? (
          <span className="res__thumb-video-manual-placeholder">クリックして動画を展開</span>
        ) : (
          <img
            src={fallbackPosterUrl}
            alt="動画サムネイル"
            loading="lazy"
            className="res__thumb-video-fallback"
          />
        ))}
      <video
        className={`res__thumb-video-preview${isPreviewReady ? " res__thumb-video-preview--ready" : ""}`}
        src={video.srcUrl}
        // 変更理由: スレッドを開いただけで全動画のメタデータを取得しないよう、明示再生まで待つ。
        preload="none"
        muted
        playsInline
        onLoadedData={() => {
          setIsPreviewReady(true);
        }}
      />
    </>
  );
}

export function ResMediaGallery({
  urls,
  onUrlClick,
  onMiddleClickStart,
  openOnMiddleMouseDown = false,
  isBlurred = false,
  imageBlurRadius = 4,
  expandedImageUrls,
  inlineImageWidths,
  onResizeImage,
  onToggleImage,
  onOpenDetachedImage,
}: ResMediaGalleryProps): React.ReactElement | null {
  const { value: confirmExternal } = useConfigBooleanSetting(EXTERNAL_LINK_CONFIRM_CONFIG_KEY);
  const { value: manualImageLoading } = useConfigBooleanSetting(MANUAL_IMAGE_LOADING_CONFIG_KEY);
  const { menu, openMenu } = useExternalLinkMenu();
  const { save, saving } = useImageSave();
  const imageStates = useMediaImageStore((state) => state.images);
  const handledMiddleClickUrlRef = useRef<string | null>(null);
  const [expandedVideoUrl, setExpandedVideoUrl] = useState<string | null>(null);
  const [imgurVideoUrls, setImgurVideoUrls] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [twitterPostStates, setTwitterPostStates] = useState<
    Map<
      string,
      { status: "loading" } | { status: "loaded"; post: TwitterPost } | { status: "error" }
    >
  >(new Map());
  const openImageContextMenu = (url: string, event: React.MouseEvent<HTMLElement>) => {
    const imageIsLoaded = useMediaImageStore.getState().images.get(url)?.status === "loaded";
    const image = event.currentTarget.querySelector<HTMLImageElement>("img[data-image-key]");
    const targetWindow = event.currentTarget.ownerDocument.defaultView;

    const viewerImages = imageUrls.includes(url) ? imageUrls : saveImageUrls;
    openMenu(url, event, [
      {
        id: "open-viewer",
        label: "ビューアで開く",
        onSelect: () => onUrlClick(url, viewerImages, 0, undefined, saveImageUrls),
      },
      ...(onToggleImage
        ? [{ id: "save-image", label: "画像を保存", onSelect: () => void save([url]) }]
        : []),
      ...(onOpenDetachedImage
        ? [
            {
              id: "open-detached-viewer",
              label: "ビューアを別窓で開く",
              onSelect: () => onOpenDetachedImage(url, viewerImages, saveImageUrls),
            },
          ]
        : []),
      ...(imageIsLoaded
        ? [
            {
              id: "discard-image",
              label: "画像を破棄",
              icon: <Trash2 size={14} />,
              danger: true,
              onSelect: () => useMediaImageStore.getState().discardImage(url),
            },
            ...(image && targetWindow
              ? collectImageMenuItems({ imageKey: url, image, targetWindow })
              : []),
          ]
        : []),
    ]);
  };
  const blurStyle: ThumbStyle = { "--res-thumb-blur-radius": `${imageBlurRadius}px` };
  const thumbStyle: ThumbStyle | undefined = isBlurred ? blurStyle : undefined;
  const hashingEnabled = useImageHashStore((state) => state.hashingEnabled);
  const imageHashEntries = useImageHashStore((state) => state.entries);
  const thumbsRef = useRef<HTMLDivElement | null>(null);

  const mediaItems = useMemo(
    () =>
      urls
        .map((url) => buildResMediaItem(url, imgurVideoUrls.get(url)))
        .filter((item): item is ResMediaItem => item != null),
    [imgurVideoUrls, urls],
  );
  const imageUrls = useMemo(
    () =>
      mediaItems
        .filter((item): item is ImageMediaItem => item.type === "image")
        .map((item) => item.rawUrl),
    [mediaItems],
  );
  // 取得済みの投稿画像も同じレスの画像として扱い、同じURLの重複保存は避ける。
  const saveImageUrls = [
    ...new Set([
      ...imageUrls,
      ...mediaItems.flatMap((item) => {
        if (item.type !== "embed" || item.embed.provider !== "twitter") return [];
        const state = twitterPostStates.get(item.embed.rawUrl);
        return state?.status === "loaded"
          ? state.post.media.filter((media) => media.type === "image").map((media) => media.url)
          : [];
      }),
    ]),
  ];

  const pageOrigin = typeof window === "undefined" ? undefined : window.location.origin;
  const expandedMediaItem = useMemo(
    () =>
      mediaItems.find(
        (item): item is EmbedMediaItem | NativeVideoMediaItem =>
          (item.type === "embed" && item.embed.rawUrl === expandedVideoUrl) ||
          (item.type === "nativeVideo" && item.rawUrl === expandedVideoUrl),
      ) ?? null,
    [expandedVideoUrl, mediaItems],
  );
  useEffect(() => {
    // 類似画像NGのルールが後から追加されると、読み込み済みの画像にはonLoadが来ない。
    // そのため有効になった時点で、表示中の画像のハッシュ計算をまとめて依頼する。
    if (!hashingEnabled) return;
    const images = thumbsRef.current?.querySelectorAll<HTMLImageElement>("img[data-image-key]");
    for (const image of images ?? []) {
      const key = image.dataset.imageKey;
      if (key) useImageHashStore.getState().requestHash(key, image);
    }
  }, [hashingEnabled, mediaItems]);
  const expandedVideoIframeSrc = useMemo(() => {
    if (expandedMediaItem?.type !== "embed" || expandedMediaItem.embed.provider !== "youtube") {
      return null;
    }

    return toRuntimeVideoEmbedUrl(expandedMediaItem.embed, pageOrigin);
  }, [expandedMediaItem, pageOrigin]);

  useEffect(() => {
    if (
      expandedVideoUrl != null &&
      !mediaItems.some(
        (item) =>
          (item.type === "embed" && item.embed.rawUrl === expandedVideoUrl) ||
          (item.type === "nativeVideo" && item.rawUrl === expandedVideoUrl),
      )
    ) {
      setExpandedVideoUrl(null);
    }
  }, [expandedVideoUrl, mediaItems]);

  if (mediaItems.length === 0) {
    return null;
  }

  const openByMiddleClick = (url: string, resImages: string[] | undefined) => {
    onUrlClick(url, resImages, 1);
  };

  const handleMiddleMouseDown = (
    event: React.MouseEvent<HTMLElement>,
    url: string,
    resImages: string[] | undefined,
  ) => {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!openOnMiddleMouseDown) {
      return;
    }

    onMiddleClickStart?.();
    // popup 内では mousedown 時点で新規タブを開き、後続 auxclick は ref で1回だけ捨てて二重起動を防ぐ。
    handledMiddleClickUrlRef.current = url;
    openByMiddleClick(url, resImages);
  };

  const handleMiddleAuxClick = (
    event: React.MouseEvent<HTMLElement>,
    url: string,
    resImages: string[] | undefined,
  ) => {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (openOnMiddleMouseDown && handledMiddleClickUrlRef.current === url) {
      handledMiddleClickUrlRef.current = null;
      return;
    }

    onMiddleClickStart?.();
    openByMiddleClick(url, resImages);
  };

  const requestTwitterPost = (embed: Extract<ExternalMediaEmbed, { provider: "twitter" }>) => {
    const currentState = twitterPostStates.get(embed.rawUrl);
    if (currentState?.status === "loading" || currentState?.status === "loaded") {
      return;
    }

    setTwitterPostStates((current) =>
      new Map(current).set(embed.rawUrl, {
        status: "loading",
      }),
    );
    void twitterPostResolver
      .resolve(embed.rawUrl)
      .then((post) => {
        setTwitterPostStates((current) =>
          new Map(current).set(
            embed.rawUrl,
            post ? { status: "loaded", post } : { status: "error" },
          ),
        );
      })
      .catch((error: unknown) => {
        // Resolver内で通常の失敗は吸収するが、予期しない例外も握りつぶさず記録する。
        logger.error("Twitter投稿の表示に失敗しました", error);
        setTwitterPostStates((current) => new Map(current).set(embed.rawUrl, { status: "error" }));
      });
  };

  return (
    <>
      <div className="res__thumbs" ref={thumbsRef}>
        {mediaItems.map((item) => {
          if (item.type === "image") {
            const imageState = imageStates.get(item.rawUrl);
            if (
              imageState?.status === "discarded" ||
              (manualImageLoading && !isImageLoadStarted(imageState?.status))
            ) {
              return (
                <button
                  key={`image:${item.rawUrl}`}
                  type="button"
                  className={`res__thumb res__thumb--image res__thumb--manual${isBlurred ? " res__thumb--blurred" : ""}`}
                  style={thumbStyle}
                  aria-label={getImagePlaceholderLabel(imageState, "画像を読み込む")}
                  title={item.rawUrl}
                  onContextMenu={(event) => openImageContextMenu(item.rawUrl, event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    requestImageDownload(item.rawUrl);
                  }}
                  onMouseDown={(event) => handleMiddleMouseDown(event, item.rawUrl, imageUrls)}
                  onAuxClick={(event) => handleMiddleAuxClick(event, item.rawUrl, imageUrls)}
                >
                  {getImagePlaceholderText(imageState)}
                </button>
              );
            }

            // 類似画像NGの判定は非同期なので、終わるまでぼかしておき、NG画像が一瞬見えるのを防ぐ。
            const isHashPending = isImageHashPending(
              hashingEnabled,
              imageHashEntries.get(item.rawUrl),
            );
            const requestImageHash = (event: React.SyntheticEvent<HTMLImageElement>) => {
              useImageHashStore.getState().requestHash(item.rawUrl, event.currentTarget);
            };
            // ExternalImageは代わりの取得も諦めたときだけonErrorを呼ぶので、判定待ちを終わらせてよい。
            const markImageUnavailable = () => {
              useImageHashStore.getState().markImageUnavailable(item.rawUrl);
            };
            if (onToggleImage && expandedImageUrls?.has(item.rawUrl)) {
              const fullSrc = toOriginalImageUrl(item.src) ?? item.src;
              return (
                <InlineExpandedImage
                  key={`image:${item.rawUrl}`}
                  src={fullSrc}
                  imageKey={item.rawUrl}
                  isBlurred={isBlurred || isHashPending}
                  blurStyle={blurStyle}
                  width={inlineImageWidths?.get(item.rawUrl)}
                  onResize={
                    onResizeImage ? (width) => onResizeImage(item.rawUrl, width) : undefined
                  }
                  onClose={() => onToggleImage(item.rawUrl)}
                  onOpenViewer={() =>
                    onUrlClick(item.rawUrl, imageUrls, 0, undefined, saveImageUrls)
                  }
                  onContextMenu={(event) => openImageContextMenu(item.rawUrl, event)}
                  onLoad={requestImageHash}
                  onError={markImageUnavailable}
                />
              );
            }
            return (
              <ConfirmableLink
                key={`image:${item.rawUrl}`}
                href={item.rawUrl}
                className={`res__thumb res__thumb--image${isBlurred || isHashPending ? " res__thumb--blurred" : ""}${isHashPending ? " res__thumb--hash-pending" : ""}`}
                style={isBlurred || isHashPending ? blurStyle : undefined}
                onContextMenu={(event) => openImageContextMenu(item.rawUrl, event)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isImgurVideoResolutionCandidate(item.rawUrl)) {
                    // 共有URLは静止画か動画かAPIでしか確定できないため、クリックされるまで照会しない。
                    void imgurVideoResolver.resolve(item.rawUrl).then((videoUrl) => {
                      if (videoUrl) {
                        setImgurVideoUrls((current) => new Map(current).set(item.rawUrl, videoUrl));
                        setExpandedVideoUrl(item.rawUrl);
                        return;
                      }
                      if (onToggleImage) onToggleImage(item.rawUrl);
                      else onUrlClick(item.rawUrl, imageUrls, 0, undefined, saveImageUrls);
                    });
                    return;
                  }
                  if (onToggleImage) onToggleImage(item.rawUrl);
                  else onUrlClick(item.rawUrl, imageUrls, 0, undefined, saveImageUrls);
                }}
                onMouseDown={(event) => handleMiddleMouseDown(event, item.rawUrl, imageUrls)}
                onAuxClick={(event) => handleMiddleAuxClick(event, item.rawUrl, imageUrls)}
                title={item.rawUrl}
              >
                {manualImageLoading ? (
                  <ManualLoadExternalImage
                    src={item.src}
                    data-image-key={item.rawUrl}
                    alt={item.rawUrl}
                    loading="lazy"
                    insideControl
                    onLoad={requestImageHash}
                    onError={markImageUnavailable}
                  />
                ) : (
                  <ExternalImage
                    src={item.src}
                    data-image-key={item.rawUrl}
                    alt={item.rawUrl}
                    loading="lazy"
                    manualLoad={false}
                    insideControl
                    onLoad={requestImageHash}
                    onError={markImageUnavailable}
                  />
                )}
              </ConfirmableLink>
            );
          }

          if (item.type === "nativeVideo") {
            const isExpanded = expandedVideoUrl === item.rawUrl;
            return (
              <button
                key={`nativeVideo:${item.rawUrl}`}
                type="button"
                className={`res__thumb res__thumb--video${isBlurred ? " res__thumb--blurred" : ""}`}
                style={thumbStyle}
                aria-pressed={isExpanded}
                aria-label={`${item.providerLabel} を${isExpanded ? "閉じる" : "展開する"}`}
                title={item.rawUrl}
                onContextMenu={(event) => {
                  // 動画サムネイル内の画像も、標準メニューから外部起動させない。
                  if (confirmExternal) openMenu(item.rawUrl, event);
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setExpandedVideoUrl((currentUrl) =>
                    currentUrl === item.rawUrl ? null : item.rawUrl,
                  );
                }}
                onMouseDown={(event) => handleMiddleMouseDown(event, item.rawUrl, undefined)}
                onAuxClick={(event) => handleMiddleAuxClick(event, item.rawUrl, undefined)}
              >
                <NativeVideoThumb
                  video={item}
                  manualImageLoading={manualImageLoading && !isExpanded}
                />
                <span className="res__thumb-badge">{item.providerLabel}</span>
                <span className="res__thumb-play" aria-hidden="true">
                  ▶
                </span>
              </button>
            );
          }

          const isExpanded =
            expandedMediaItem?.type === "embed" &&
            expandedMediaItem.embed.rawUrl === item.embed.rawUrl;
          const isTwitterPost = item.embed.provider === "twitter";
          const shouldOpenExternally =
            item.embed.provider === "youtube" &&
            shouldOpenYouTubeExternally(item.embed, pageOrigin);
          return (
            <button
              key={`video:${item.embed.rawUrl}`}
              type="button"
              className={`res__thumb ${isTwitterPost ? "res__thumb--post" : "res__thumb--video"}${isBlurred ? " res__thumb--blurred" : ""}`}
              style={thumbStyle}
              aria-pressed={shouldOpenExternally ? undefined : isExpanded}
              aria-label={`${item.embed.providerLabel} を${shouldOpenExternally ? "新しいタブで開く" : isExpanded ? "閉じる" : "展開する"}`}
              title={item.embed.rawUrl}
              onContextMenu={(event) => {
                if (confirmExternal) openMenu(item.embed.externalUrl, event);
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (shouldOpenExternally) {
                  // 拡張ページの YouTube iframe は Referer 欠落と他拡張の介入で 153 が再発しやすい。
                  // 左クリックは失敗しない通常タブへ逃がして、壊れた埋め込み UI を見せない。
                  const sourceWindow = event.currentTarget.ownerDocument.defaultView ?? window;
                  requestExternalLink(item.embed.externalUrl, {
                    sourceWindow,
                    open: (url) => {
                      sourceWindow.open(url, "_blank", "noopener,noreferrer");
                    },
                  });
                  return;
                }

                const willExpand = expandedVideoUrl !== item.embed.rawUrl;
                // 外部APIは全レス表示時に一斉取得せず、利用者が展開した投稿だけ取得する。
                setExpandedVideoUrl(willExpand ? item.embed.rawUrl : null);
                if (willExpand && item.embed.provider === "twitter") {
                  requestTwitterPost(item.embed);
                }
              }}
              onMouseDown={(event) =>
                handleMiddleMouseDown(
                  event,
                  shouldOpenExternally ? item.embed.externalUrl : item.embed.rawUrl,
                  undefined,
                )
              }
              onAuxClick={(event) =>
                handleMiddleAuxClick(
                  event,
                  shouldOpenExternally ? item.embed.externalUrl : item.embed.rawUrl,
                  undefined,
                )
              }
            >
              {isTwitterPost ? (
                <>
                  {/* 投稿URLを動画と誤認しないよう、再生記号を使わず文書型の見た目に分ける。 */}
                  <span className="res__thumb-post-card" aria-hidden="true">
                    <span className="res__thumb-post-logo">𝕏</span>
                    <span className="res__thumb-post-action">投稿を表示</span>
                  </span>
                  <span className="res__thumb-badge res__thumb-badge--post">X POST</span>
                </>
              ) : (
                <>
                  <VideoThumbImage
                    embed={item.embed}
                    manualImageLoading={manualImageLoading && !isExpanded}
                  />
                  <span className="res__thumb-badge">{item.embed.providerLabel}</span>
                  <span className="res__thumb-play" aria-hidden="true">
                    ▶
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {onToggleImage && saveImageUrls.length > 1 && (
        <div className="res__image-actions">
          <button
            type="button"
            className="res__image-save-all"
            disabled={saving}
            onClick={() => void save(saveImageUrls)}
          >
            <Download size={14} aria-hidden="true" />
            {saving ? "保存中…" : "このレスの画像をすべて保存"}
          </button>
        </div>
      )}

      {expandedMediaItem && (
        <div
          className={`res__media-embed${expandedMediaItem.type === "embed" ? ` res__media-embed--${expandedMediaItem.embed.provider}` : " res__media-embed--native"}`}
        >
          <div className="res__media-embed-toolbar">
            <span className="res__media-embed-label">
              {expandedMediaItem.type === "embed"
                ? expandedMediaItem.embed.providerLabel
                : expandedMediaItem.providerLabel}
            </span>
            <button
              type="button"
              className="res__media-embed-close"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setExpandedVideoUrl(null);
              }}
            >
              閉じる
            </button>
          </div>
          {expandedMediaItem.type === "embed" && expandedMediaItem.embed.provider === "twitter" ? (
            (() => {
              const state = twitterPostStates.get(expandedMediaItem.embed.rawUrl);
              return state?.status === "loaded" ? (
                <TwitterPostCard
                  embed={expandedMediaItem.embed}
                  post={state.post}
                  manualImageLoading={manualImageLoading}
                  resSaveImages={saveImageUrls}
                  onUrlClick={onUrlClick}
                  onMiddleMouseDown={handleMiddleMouseDown}
                  onAuxClick={handleMiddleAuxClick}
                  onImageContextMenu={openImageContextMenu}
                />
              ) : (
                <TwitterPostFallback
                  embed={expandedMediaItem.embed}
                  isLoading={state?.status !== "error"}
                />
              );
            })()
          ) : expandedMediaItem.type === "embed" &&
            expandedMediaItem.embed.provider === "youtube" ? (
            <iframe
              className={`res__media-embed-frame res__media-embed-frame--${expandedMediaItem.embed.provider}`}
              src={expandedVideoIframeSrc ?? expandedMediaItem.embed.embedUrl}
              title={expandedMediaItem.embed.iframeTitle}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              // ここへ来るのは通常の Web/Tauri 側だけで、拡張ページはクリック時点で外部タブへ逃がす。
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : expandedMediaItem.type === "nativeVideo" ? (
            <video
              className="res__media-embed-player"
              src={expandedMediaItem.srcUrl}
              onContextMenu={(event) => {
                if (confirmExternal) openMenu(expandedMediaItem.rawUrl, event);
              }}
              controls
              playsInline
              preload="metadata"
            />
          ) : null}
        </div>
      )}
      {menu}
    </>
  );
}
