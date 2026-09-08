import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getDirectVideoFallbackThumbnailUrl,
  getDirectVideoLabel,
  isDirectVideoUrl,
  shouldOpenYouTubeExternally,
  toTwitterPostEmbed,
  toInlineVideoEmbed,
  toRuntimeVideoEmbedUrl,
  type ExternalMediaEmbed,
} from "src/view/browser/utils/external-media";
import type { UrlClickHandler } from "src/view/browser/utils/link-routing";
import { twitterPostResolver, type TwitterPost } from "src/view/browser/utils/twitter-post";
import { toViewerImageUrl } from "src/view/browser/utils/url-media";

interface ResMediaGalleryProps {
  urls: string[];
  onUrlClick: UrlClickHandler;
  onMiddleClickStart?: () => void;
  openOnMiddleMouseDown?: boolean;
  isBlurred?: boolean;
  imageBlurRadius?: number;
}

type ThumbStyle = React.CSSProperties & {
  "--res-thumb-blur-radius"?: string;
};

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
  providerLabel: string;
}

type ResMediaItem = ImageMediaItem | EmbedMediaItem | NativeVideoMediaItem;

function buildResMediaItem(rawUrl: string): ResMediaItem | null {
  const imageUrl = toViewerImageUrl(rawUrl);
  if (imageUrl) {
    return {
      type: "image",
      rawUrl,
      src: imageUrl,
    };
  }

  if (isDirectVideoUrl(rawUrl)) {
    return {
      type: "nativeVideo",
      rawUrl,
      providerLabel: getDirectVideoLabel(rawUrl),
    };
  }

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

function VideoThumbImage({ embed }: { embed: ExternalMediaEmbed }): React.ReactElement {
  const [posterUrl, setPosterUrl] = useState(embed.thumbnailUrl);

  useEffect(() => {
    setPosterUrl(embed.thumbnailUrl);
  }, [embed.thumbnailUrl]);

  return (
    <img
      src={posterUrl}
      alt={`${embed.providerLabel} のサムネイル`}
      loading="lazy"
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
}: {
  embed: ExternalMediaEmbed;
  post: TwitterPost;
}): React.ReactElement {
  return (
    <div className="res__twitter-post">
      <div className="res__twitter-post-author">
        {post.author.avatarUrl && (
          <img
            className="res__twitter-post-avatar"
            src={post.author.avatarUrl}
            alt=""
            loading="lazy"
          />
        )}
        <div>
          <a href={embed.externalUrl} target="_blank" rel="noopener noreferrer">
            {post.author.name}
          </a>
          {post.author.screenName && (
            <span className="res__twitter-post-screen-name">@{post.author.screenName}</span>
          )}
        </div>
      </div>
      {post.text && <p className="res__twitter-post-text">{post.text}</p>}
      {post.media.length > 0 && (
        <div className="res__twitter-post-media">
          {post.media.map((media, index) => {
            if (media.type === "image") {
              return (
                <a
                  key={`${media.type}:${media.url}`}
                  href={media.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img src={media.url} alt={media.altText ?? "投稿画像"} loading="lazy" />
                </a>
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
      <a
        className="res__twitter-post-external"
        href={embed.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Xで投稿を開く
      </a>
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
      <a href={embed.externalUrl} target="_blank" rel="noopener noreferrer">
        元の投稿を開く
      </a>
    </div>
  );
}

function NativeVideoThumb({ rawUrl }: { rawUrl: string }): React.ReactElement {
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const fallbackPosterUrl = getDirectVideoFallbackThumbnailUrl();

  return (
    <>
      {!isPreviewReady && (
        <img
          src={fallbackPosterUrl}
          alt="動画サムネイル"
          loading="lazy"
          className="res__thumb-video-fallback"
        />
      )}
      <video
        className={`res__thumb-video-preview${isPreviewReady ? " res__thumb-video-preview--ready" : ""}`}
        src={rawUrl}
        preload="metadata"
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
}: ResMediaGalleryProps): React.ReactElement | null {
  const handledMiddleClickUrlRef = useRef<string | null>(null);
  const [expandedVideoUrl, setExpandedVideoUrl] = useState<string | null>(null);
  const [twitterPostStates, setTwitterPostStates] = useState<
    Map<
      string,
      { status: "loading" } | { status: "loaded"; post: TwitterPost } | { status: "error" }
    >
  >(new Map());
  const thumbStyle: ThumbStyle | undefined = isBlurred
    ? {
        "--res-thumb-blur-radius": `${imageBlurRadius}px`,
      }
    : undefined;

  const mediaItems = useMemo(
    () => urls.map(buildResMediaItem).filter((item): item is ResMediaItem => item != null),
    [urls],
  );
  const imageUrls = useMemo(
    () =>
      mediaItems
        .filter((item): item is ImageMediaItem => item.type === "image")
        .map((item) => item.rawUrl),
    [mediaItems],
  );
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
        console.error("[ResMediaGallery] Twitter投稿の表示に失敗しました", error);
        setTwitterPostStates((current) => new Map(current).set(embed.rawUrl, { status: "error" }));
      });
  };

  return (
    <>
      <div className="res__thumbs">
        {mediaItems.map((item) => {
          if (item.type === "image") {
            return (
              <a
                key={`image:${item.rawUrl}`}
                href={item.rawUrl}
                className={`res__thumb${isBlurred ? " res__thumb--blurred" : ""}`}
                style={thumbStyle}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onUrlClick(item.rawUrl, imageUrls, 0);
                }}
                onMouseDown={(event) => handleMiddleMouseDown(event, item.rawUrl, imageUrls)}
                onAuxClick={(event) => handleMiddleAuxClick(event, item.rawUrl, imageUrls)}
                title={item.rawUrl}
              >
                <img src={item.src} alt={item.rawUrl} loading="lazy" />
              </a>
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
                <NativeVideoThumb rawUrl={item.rawUrl} />
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
          const shouldOpenExternally =
            item.embed.provider === "youtube" &&
            shouldOpenYouTubeExternally(item.embed, pageOrigin);
          return (
            <button
              key={`video:${item.embed.rawUrl}`}
              type="button"
              className={`res__thumb res__thumb--video${isBlurred ? " res__thumb--blurred" : ""}`}
              style={thumbStyle}
              aria-pressed={shouldOpenExternally ? undefined : isExpanded}
              aria-label={`${item.embed.providerLabel} を${shouldOpenExternally ? "新しいタブで開く" : isExpanded ? "閉じる" : "展開する"}`}
              title={item.embed.rawUrl}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (shouldOpenExternally) {
                  // 拡張ページの YouTube iframe は Referer 欠落と他拡張の介入で 153 が再発しやすい。
                  // 左クリックは失敗しない通常タブへ逃がして、壊れた埋め込み UI を見せない。
                  window.open(item.embed.externalUrl, "_blank", "noopener,noreferrer");
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
              <VideoThumbImage embed={item.embed} />
              <span className="res__thumb-badge">{item.embed.providerLabel}</span>
              <span className="res__thumb-play" aria-hidden="true">
                ▶
              </span>
            </button>
          );
        })}
      </div>

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
                <TwitterPostCard embed={expandedMediaItem.embed} post={state.post} />
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
              src={expandedMediaItem.rawUrl}
              controls
              playsInline
              preload="metadata"
            />
          ) : null}
        </div>
      )}
    </>
  );
}
