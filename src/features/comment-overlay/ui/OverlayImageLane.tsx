import "./OverlayImageLane.css";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import { toViewerImageUrl } from "src/core/util/url-media";
import { ExternalImage } from "src/features/media/ui/ExternalImage";
import { copyText } from "src/view/browser/utils/clipboard";

import { commentIdentity } from "../domain";
import type { CommentCandidate } from "../domain/comment-types";

export const COMMENT_OVERLAY_IMAGE_REFERENCE_WIDTH = 600;
export const COMMENT_OVERLAY_IMAGE_REFERENCE_HEIGHT = 800;
export const COMMENT_OVERLAY_IMAGE_HEIGHT = 300;
export const COMMENT_OVERLAY_IMAGE_BOTTOM_PADDING = 10;
export const COMMENT_OVERLAY_IMAGE_TRAVEL_SECONDS = 6;
const MAX_IMAGE_QUEUE_SIZE = 64;
const logger = createLogger("comment-overlay");

interface OverlayImage {
  key: string;
  url: string;
  asciiArtText?: string;
}

/** CSS animationの完了後に先頭だけを除き、次の画像へ進める。 */
export function removeCompletedOverlayImage(
  queue: readonly OverlayImage[],
): readonly OverlayImage[] {
  return queue.slice(1);
}

interface OverlayImageLaneProps {
  comments: readonly CommentCandidate[];
  stageWidth: number;
  imageScale: number;
  imageOpacity: number;
  playing: boolean;
}

/** 画像は下部の専用レーンへ集め、テキストコメントと独立して順番に流す。 */
export function OverlayImageLane({
  comments,
  stageWidth,
  imageScale,
  imageOpacity,
  playing,
}: OverlayImageLaneProps) {
  const [queue, setQueue] = useState<readonly OverlayImage[]>([]);
  const [naturalDimensions, setNaturalDimensions] = useState<{
    key: string;
    width: number;
    height: number;
  } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const seenImages = useRef(new Set<string>());
  const seenOrder = useRef<string[]>([]);

  useEffect(() => {
    const additions: OverlayImage[] = [];
    for (const comment of comments) {
      const identity = commentIdentity(comment);
      if (comment.asciiArtImageUrl) {
        const key = `${identity}:ascii-art`;
        if (!seenImages.current.has(key)) {
          seenImages.current.add(key);
          seenOrder.current.push(key);
          additions.push({
            key,
            url: comment.asciiArtImageUrl,
            asciiArtText: comment.text,
          });
        }
      }
      for (const [index, url] of (comment.imageUrls ?? []).slice(0, 3).entries()) {
        const key = `${identity}:${index}:${url}`;
        if (seenImages.current.has(key)) continue;
        seenImages.current.add(key);
        seenOrder.current.push(key);
        additions.push({ key, url: toViewerImageUrl(url) ?? url });
      }
    }

    while (seenOrder.current.length > MAX_IMAGE_QUEUE_SIZE * 4) {
      const expired = seenOrder.current.shift();
      if (expired) seenImages.current.delete(expired);
    }
    if (additions.length === 0) return;
    // 親から増えたコメント画像を、表示中の画像を保ったまま待ち行列へ取り込む。
    // oxlint-disable-next-line react/set-state-in-effect -- 外部の実況入力を待ち行列へ同期する。
    setQueue((current) => [...current, ...additions].slice(-MAX_IMAGE_QUEUE_SIZE));
  }, [comments]);

  const activeImage = queue[0];
  if (!activeImage) return null;
  const imageHeight = Math.max(1, Math.round(COMMENT_OVERLAY_IMAGE_HEIGHT * imageScale));
  const isLoadedImage = naturalDimensions?.key === activeImage.key;
  const isFailedAsciiArt = failedKey === activeImage.key && activeImage.asciiArtText != null;
  const aspectRatio = isLoadedImage
    ? naturalDimensions.width / Math.max(1, naturalDimensions.height)
    : 1;
  const imageWidth = Math.max(1, Math.round(imageHeight * aspectRatio));

  const imageStyle = {
    left: "100%",
    width: `${imageWidth}px`,
    height: `${imageHeight}px`,
    "--comment-overlay-image-exit-translate": `-${stageWidth + imageWidth}px`,
    animationDuration: `${COMMENT_OVERLAY_IMAGE_TRAVEL_SECONDS}s`,
    animationPlayState: playing ? "running" : "paused",
    opacity: imageOpacity,
  } as CSSProperties;

  return (
    <div
      className="comment-overlay-image-lane"
      data-testid="comment-overlay-image-lane"
      style={{
        bottom: `${COMMENT_OVERLAY_IMAGE_BOTTOM_PADDING * imageScale}px`,
        height: `${imageHeight}px`,
      }}
      onAnimationEnd={() => setQueue(removeCompletedOverlayImage)}
    >
      {isFailedAsciiArt ? (
        <pre
          className="comment-overlay-image-lane__fallback"
          data-testid="comment-overlay-aa-fallback"
          style={imageStyle}
          onContextMenu={(event) => {
            event.preventDefault();
            void copyText(activeImage.asciiArtText ?? "").catch((error: unknown) => {
              logger.error("AAコメントのコピーに失敗しました:", error);
            });
          }}
        >
          {activeImage.asciiArtText}
        </pre>
      ) : (
        <ExternalImage
          key={activeImage.key}
          className="comment-overlay-image-lane__image"
          data-testid={
            activeImage.asciiArtText != null ? "comment-overlay-aa-image" : "comment-overlay-image"
          }
          data-image-key={activeImage.key}
          src={activeImage.url}
          alt={activeImage.asciiArtText ?? ""}
          title={activeImage.asciiArtText != null ? "右クリックでAA本文をコピー" : undefined}
          width={imageWidth}
          height={imageHeight}
          loading="eager"
          decoding="async"
          style={imageStyle}
          onContextMenu={
            activeImage.asciiArtText == null
              ? undefined
              : (event) => {
                  event.preventDefault();
                  void copyText(activeImage.asciiArtText ?? "").catch((error: unknown) => {
                    logger.error("AAコメントのコピーに失敗しました:", error);
                  });
                }
          }
          onError={() => {
            if (activeImage.asciiArtText != null) setFailedKey(activeImage.key);
          }}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth <= 0 || naturalHeight <= 0) return;
            setNaturalDimensions({
              key: activeImage.key,
              width: naturalWidth,
              height: naturalHeight,
            });
          }}
        />
      )}
    </div>
  );
}
