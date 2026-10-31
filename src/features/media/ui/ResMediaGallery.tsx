import { Download, Trash2 } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import {
  type ExternalMediaEmbed,
  shouldOpenYouTubeExternally,
  toRuntimeVideoEmbedUrl,
} from "src/core/util/external-media";
import { toOriginalImageUrl } from "src/core/util/url-media";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { useExternalLinkMenu } from "src/view/browser/hooks/use-external-link-menu";
import { ConfirmableLink } from "src/view/browser/ui/ConfirmableLink";
import { Spinner } from "src/view/browser/ui/Spinner";
import { requestExternalLink } from "src/view/browser/utils/external-link";
import { EXTERNAL_LINK_CONFIRM_CONFIG_KEY } from "src/view/browser/utils/external-link-analysis";

import { imgurVideoResolver, isImgurVideoResolutionCandidate } from "../application/imgur-album";
import { type TwitterPost, twitterPostResolver } from "../application/twitter-post";
import { collectImageMenuItems } from "../browser/image-menu-contributions";
import { isImageHashPending, useImageHashStore } from "../browser/use-image-hash-store";
import { useImageSave } from "../browser/use-image-save";
import { useMediaImageStore } from "../browser/use-media-image-store";
import { MANUAL_IMAGE_LOADING_CONFIG_KEY } from "../domain/media-settings";
import { ExternalImage } from "./ExternalImage";
import {
  getImagePlaceholderLabel,
  getImagePlaceholderText,
  isImageLoadStarted,
  requestImageDownload,
} from "./image-placeholder";
import { InlineExpandedImage } from "./InlineExpandedImage";
import { ManualLoadExternalImage } from "./ManualLoadExternalImage";
import {
  buildResMediaItem,
  type EmbedMediaItem,
  type ImageMediaItem,
  type MediaUrlClickHandler,
  type NativeVideoMediaItem,
  type ResMediaItem,
  type ThumbStyle,
} from "./res-media-items";
import { TwitterPostCard, TwitterPostFallback } from "./TwitterPostCard";
import { NativeVideoThumb, VideoThumbImage } from "./VideoThumbs";

const logger = createLogger("media");

interface ResMediaGalleryProps {
  urls: string[];
  onUrlClick: MediaUrlClickHandler;
  /** この表示に限り、手動取得設定より自動取得を優先する。 */
  autoLoadImages?: boolean;
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

export function ResMediaGallery({
  urls,
  onUrlClick,
  autoLoadImages = false,
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
  const { value: manualImageLoadingSetting } = useConfigBooleanSetting(
    MANUAL_IMAGE_LOADING_CONFIG_KEY,
  );
  // 実況表示では新着を操作なしで追えるよう、このギャラリーだけ自動取得にする。
  const manualImageLoading = manualImageLoadingSetting && !autoLoadImages;
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
  // 複数画像のレスはインライン展開だと縦に長くなり比較しづらいため、クリックでビューアを開く。
  const openImage = (url: string) => {
    if (onToggleImage && imageUrls.length <= 1) {
      onToggleImage(url);
      return;
    }
    onUrlClick(url, imageUrls, 0, undefined, saveImageUrls);
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
            return (
              <React.Fragment key={`image:${item.rawUrl}`}>
                <ConfirmableLink
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
                          setImgurVideoUrls((current) =>
                            new Map(current).set(item.rawUrl, videoUrl),
                          );
                          setExpandedVideoUrl(item.rawUrl);
                          return;
                        }
                        openImage(item.rawUrl);
                      });
                      return;
                    }
                    openImage(item.rawUrl);
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
                  {onToggleImage && expandedImageUrls?.has(item.rawUrl) && (
                    <span
                      className="res__inline-image-loading"
                      role="status"
                      aria-label="画像を展開中"
                    >
                      <Spinner size="sm" aria-hidden="true" />
                    </span>
                  )}
                </ConfirmableLink>
                {onToggleImage && expandedImageUrls?.has(item.rawUrl) && (
                  <InlineExpandedImage
                    key={`image:${item.rawUrl}`}
                    src={toOriginalImageUrl(item.src) ?? item.src}
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
                )}
              </React.Fragment>
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
