import React, { useEffect, useMemo, useRef, useState } from "react";
import type { UrlClickHandler } from "src/view/browser/utils/link-routing";
import {
  getDirectVideoFallbackThumbnailUrl,
  getDirectVideoLabel,
  isDirectVideoUrl,
  toInlineVideoEmbed,
  type ExternalVideoEmbed,
} from "src/view/browser/utils/external-media";
import { toViewerImageUrl } from "src/view/browser/utils/utils";

interface ResMediaGalleryProps {
  urls: string[];
  onUrlClick: UrlClickHandler;
  onMiddleClickStart?: () => void;
  openOnMiddleMouseDown?: boolean;
}

interface ImageMediaItem {
  type: "image";
  rawUrl: string;
  src: string;
}

interface VideoMediaItem {
  type: "video";
  embed: ExternalVideoEmbed;
}

interface NativeVideoMediaItem {
  type: "nativeVideo";
  rawUrl: string;
  providerLabel: string;
}

type ResMediaItem = ImageMediaItem | VideoMediaItem | NativeVideoMediaItem;

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
      type: "video",
      embed: videoEmbed,
    };
  }

  return null;
}

function VideoThumbImage({
  embed,
}: {
  embed: ExternalVideoEmbed;
}): JSX.Element {
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

function NativeVideoThumb({ rawUrl }: { rawUrl: string }): JSX.Element {
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
}: ResMediaGalleryProps): JSX.Element | null {
  const handledMiddleClickUrlRef = useRef<string | null>(null);
  const [expandedVideoUrl, setExpandedVideoUrl] = useState<string | null>(null);

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
  const expandedVideo = useMemo(
    () =>
      mediaItems.find(
        (item): item is VideoMediaItem | NativeVideoMediaItem =>
          (item.type === "video" && item.embed.rawUrl === expandedVideoUrl) ||
          (item.type === "nativeVideo" && item.rawUrl === expandedVideoUrl),
      ) ?? null,
    [expandedVideoUrl, mediaItems],
  );

  useEffect(() => {
    if (
      expandedVideoUrl != null &&
      !mediaItems.some(
        (item) =>
          (item.type === "video" && item.embed.rawUrl === expandedVideoUrl) ||
          (item.type === "nativeVideo" && item.rawUrl === expandedVideoUrl),
      )
    ) {
      setExpandedVideoUrl(null);
    }
  }, [expandedVideoUrl, mediaItems]);

  if (mediaItems.length === 0) {
    return null;
  }

  const openByMiddleClick = (
    url: string,
    resImages: string[] | undefined,
  ) => {
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

  return (
    <>
      <div className="res__thumbs">
        {mediaItems.map((item) => {
          if (item.type === "image") {
            return (
              <a
                key={`image:${item.rawUrl}`}
                href={item.rawUrl}
                className="res__thumb"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onUrlClick(item.rawUrl, imageUrls, 0);
                }}
                onMouseDown={(event) =>
                  handleMiddleMouseDown(event, item.rawUrl, imageUrls)
                }
                onAuxClick={(event) =>
                  handleMiddleAuxClick(event, item.rawUrl, imageUrls)
                }
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
                className="res__thumb res__thumb--video"
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
                onMouseDown={(event) =>
                  handleMiddleMouseDown(event, item.rawUrl, undefined)
                }
                onAuxClick={(event) =>
                  handleMiddleAuxClick(event, item.rawUrl, undefined)
                }
              >
                <NativeVideoThumb rawUrl={item.rawUrl} />
                <span className="res__thumb-badge">{item.providerLabel}</span>
                <span className="res__thumb-play" aria-hidden="true">
                  ▶
                </span>
              </button>
            );
          }

          const isExpanded = expandedVideo?.embed.rawUrl === item.embed.rawUrl;
          return (
            <button
              key={`video:${item.embed.rawUrl}`}
              type="button"
              className="res__thumb res__thumb--video"
              aria-pressed={isExpanded}
              aria-label={`${item.embed.providerLabel} の動画を${isExpanded ? "閉じる" : "展開する"}`}
              title={item.embed.rawUrl}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                // 動画はモーダルへ送らずレス内で1件だけ開閉し、4chan風のその場再生に寄せる。
                setExpandedVideoUrl((currentUrl) =>
                  currentUrl === item.embed.rawUrl ? null : item.embed.rawUrl,
                );
              }}
              onMouseDown={(event) =>
                handleMiddleMouseDown(event, item.embed.rawUrl, undefined)
              }
              onAuxClick={(event) =>
                handleMiddleAuxClick(event, item.embed.rawUrl, undefined)
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

      {expandedVideo && (
        <div
          className={`res__media-embed${expandedVideo.type === "video" ? ` res__media-embed--${expandedVideo.embed.provider}` : " res__media-embed--native"}`}
        >
          <div className="res__media-embed-toolbar">
            <span className="res__media-embed-label">
              {expandedVideo.type === "video"
                ? expandedVideo.embed.providerLabel
                : expandedVideo.providerLabel}
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
          {expandedVideo.type === "video" ? (
            <iframe
              className={`res__media-embed-frame res__media-embed-frame--${expandedVideo.embed.provider}`}
              src={expandedVideo.embed.embedUrl}
              title={expandedVideo.embed.iframeTitle}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <video
              className="res__media-embed-player"
              src={expandedVideo.rawUrl}
              controls
              playsInline
              preload="metadata"
            />
          )}
        </div>
      )}
    </>
  );
}
