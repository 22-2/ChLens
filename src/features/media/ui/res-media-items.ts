import type React from "react";
import {
  type ExternalMediaEmbed,
  getDirectVideoLabel,
  isDirectVideoUrl,
  toInlineVideoEmbed,
  toTwitterPostEmbed,
} from "src/core/util/external-media";
import { toViewerImageUrl } from "src/core/util/url-media";
import type { UrlHandlingMode } from "src/view/browser/utils/link-routing";

// ギャラリーはThreadViewやPopupのURLルーティング実装を知らず、クリック時の引数だけを契約にする。
export type MediaUrlClickHandler = (
  url: string,
  resImages?: string[],
  button?: 0 | 1,
  mode?: UrlHandlingMode,
  resSaveImages?: string[],
) => boolean | void;

export type ThumbStyle = React.CSSProperties & {
  "--res-thumb-blur-radius"?: string;
};

export interface ImageMediaItem {
  type: "image";
  rawUrl: string;
  src: string;
}

export interface EmbedMediaItem {
  type: "embed";
  embed: ExternalMediaEmbed;
}

export interface NativeVideoMediaItem {
  type: "nativeVideo";
  rawUrl: string;
  srcUrl: string;
  providerLabel: string;
}

export type ResMediaItem = ImageMediaItem | EmbedMediaItem | NativeVideoMediaItem;

export function buildResMediaItem(rawUrl: string, resolvedVideoUrl?: string): ResMediaItem | null {
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
