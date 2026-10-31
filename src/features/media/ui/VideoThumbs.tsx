import React, { useEffect, useState } from "react";
import {
  type ExternalMediaEmbed,
  getDirectVideoFallbackThumbnailUrl,
} from "src/core/util/external-media";

import { ExternalImage } from "./ExternalImage";
import type { NativeVideoMediaItem } from "./res-media-items";

export function VideoThumbImage({
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

export function NativeVideoThumb({
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
