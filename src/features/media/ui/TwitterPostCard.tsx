import { parseMessage } from "@chlen/chlib";
import React, { useState } from "react";
import type { ExternalMediaEmbed } from "src/core/util/external-media";
import { ConfirmableLink } from "src/view/browser/ui/ConfirmableLink";

import {
  type TwitterPost,
  type TwitterPostMetrics,
  twitterPostResolver,
  type TwitterVerificationBadgeColor,
} from "../application/twitter-post";
import { useMediaImageStore } from "../browser/use-media-image-store";
import { ExternalImage } from "./ExternalImage";
import {
  getImagePlaceholderLabel,
  getImagePlaceholderText,
  isImageLoadStarted,
  requestImageDownload,
} from "./image-placeholder";
import { ManualLoadExternalImage } from "./ManualLoadExternalImage";
import type { MediaUrlClickHandler } from "./res-media-items";

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

export function TwitterPostCard({
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

export function TwitterPostFallback({
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
