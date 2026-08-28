import React, { useMemo, useState } from "react";
import type { IRes } from "src/service-container";
import { NgBadge } from "src/view/browser/components/NgBadge";
import { ResBody } from "src/view/browser/components/ResBody";
import { ResMediaGallery } from "src/view/browser/components/ResMediaGallery";
import { useIsNgTemporarilyDisabled } from "src/view/browser/hooks/use-ng-status";
import { getIdHeatColor } from "src/view/browser/utils/id-heat";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";
import { getReplyHeatLevel } from "src/view/browser/utils/reply-heat";
import { useImgurAlbumMedia } from "src/view/browser/utils/imgur-album";
import { decodeResponseHtml } from "src/view/browser/utils/response-format";
import { extractUrlsFromMessage } from "src/view/browser/utils/url-media";
import {
  findSearchMatchRanges,
  highlightSearchMatches,
} from "src/view/browser/utils/search-highlight";

function renderHighlightedText(text: string, searchQuery: string): React.ReactNode {
  const ranges = findSearchMatchRanges(text, searchQuery);
  if (ranges.length === 0) {
    return text;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push(text.slice(cursor, range.start));
    }
    parts.push(
      <mark key={`${range.start}-${range.end}`} className="res__search-match">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts;
}

export const ResItem: React.FC<ResItemProps> = React.memo(
  ({
    res,
    idPos,
    idCount,
    repCount,
    miniAa,
    messageProtocol,
    onIdClick,
    onRepClick,
    onUrlClick,
    onUrlContextMenu,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
    onContextMenu,
    isOwn,
    isReplyToOwn,
    isImageBlurred,
    imageBlurRadius,
    ngResNums,
    threadUrl,
    searchQuery = "",
  }) => {
    const isNgTemporarilyDisabled = useIsNgTemporarilyDisabled();
    // res.ng はサービス層がNGワード照合した結果を格納するフィールド。
    // 古いビューは class[] の "ng" 要素で判定していたが、new viewでは res.ng を優先チェックする。
    // 一時解除中はデータ自体を消さずに表示判定だけをオフにして、復帰時の再評価コストを避ける。
    const isNgMatched = res.ng != null || res.class?.includes("ng");
    const isNG = !isNgTemporarilyDisabled && isNgMatched;
    const [isNgRevealed, setIsNgRevealed] = useState(false);
    const decoded = useMemo(() => decodeResponseHtml(res, messageProtocol), [messageProtocol, res]);
    // 検索判定と同じ語を表示層へ渡し、本文・名前・IDのどこでレスが一致したかを追えるようにする。
    // 本文と名前のHTMLはテキストノードだけを変換し、リンクやアンカーの操作対象を保つ。
    const highlightedNameHtml = useMemo(
      () => highlightSearchMatches(decoded.nameHtml, searchQuery),
      [decoded.nameHtml, searchQuery],
    );
    const urls = useMemo(() => extractUrlsFromMessage(decoded.messageHtml), [decoded.messageHtml]);
    const resolvedMedia = useImgurAlbumMedia(decoded.messageHtml, urls, threadUrl);
    const replyHeat = getReplyHeatLevel(repCount);
    const resNumClassName = `res__num${
      replyHeat === "hot" ? " res__num--hot" : replyHeat === "warm" ? " res__num--warm" : ""
    }`;
    const repClassName = `res__rep${
      replyHeat === "hot"
        ? " res__rep--hot"
        : replyHeat === "warm"
          ? " res__rep--warm"
          : " res__rep--link"
    }`;
    // 状態フラグが重なるレスでも表示色が揺れないよう、優先順位をここで一度だけ解決する。
    // NGは一時解除中でも最も強い注意状態として残し、次に自分、最後に自分宛て返信を採用する。
    // 既存の個別フラグ用クラスは互換性のため残し、色と行インジケーターは解決済みクラスで統一する。
    const responseState = isNgMatched ? "ng" : isOwn ? "own" : isReplyToOwn ? "reply-to-own" : null;
    const responseStateClassName = responseState ? `res--state-${responseState}` : "";
    const nameStateClassName = responseState ? `res__name--state-${responseState}` : "";
    const articleClassName = [
      "res",
      miniAa ? "res--aa" : "",
      isOwn ? "res--own" : "",
      isReplyToOwn ? "res--reply-to-own" : "",
      responseStateClassName,
    ]
      .filter(Boolean)
      .join(" ");
    const nameClassName = [
      "res__name",
      isOwn ? "res__name--own" : "",
      isReplyToOwn ? "res__name--reply-to-own" : "",
      nameStateClassName,
    ]
      .filter(Boolean)
      .join(" ");

    if (isNG && !isNgRevealed) {
      return (
        <article
          data-res-num={res.num}
          className={`res res--ng-placeholder${responseStateClassName ? ` ${responseStateClassName}` : ""}`}
          role="button"
          aria-label={`レス${res.num}の内容を表示`}
          tabIndex={0}
          onClick={() => setIsNgRevealed(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsNgRevealed(true);
            }
          }}
          onContextMenu={(event) => onContextMenu(event, res)}
        >
          <header className="res__header">
            <span className={resNumClassName}>{res.num}</span>
            <NgBadge result={res.ng} />
          </header>
          <div className="res__ng-reveal">クリックして内容を表示</div>
        </article>
      );
    }

    return (
      <article
        data-res-num={res.num}
        className={articleClassName}
        onContextMenu={(e) => {
          if (
            e.target instanceof Element &&
            e.target.closest("a, .res__link, .res__thumb, .res__media-embed")
          ) {
            // リンクや画像の右クリックはブラウザ既定メニューへ委譲する。
            return;
          }
          onContextMenu(e, res);
        }}
      >
        <header className="res__header">
          <span className={resNumClassName}>{res.num}</span>
          <span
            className={nameClassName}
            dangerouslySetInnerHTML={{ __html: highlightedNameHtml }}
          />
          {isOwn ? <span className="res__badge res__badge--own">自分</span> : null}
          {isReplyToOwn ? <span className="res__badge res__badge--reply-to-own">返信</span> : null}
          {isNgMatched ? <NgBadge result={res.ng} /> : null}
          {res.id && (
            <span
              className={`res__id${
                idCount >= 5 ? " res__id--freq" : idCount >= 2 ? " res__id--link" : ""
              }`}
              // IDは出現数に応じて連続色にして、少数/中間/多投稿の密度差を一目で判別しやすくする。
              style={{ color: getIdHeatColor(idCount) }}
              onClick={(e) => {
                e.stopPropagation();
                onIdClick(res.id!, e);
              }}
            >
              {renderHighlightedText(res.id, searchQuery)}
              {idCount >= 2 && `(${idPos}/${idCount})`}
            </span>
          )}
          <span className="res__date">{res.date ?? res.other}</span>
          {repCount > 0 && (
            <span
              className={repClassName}
              onClick={(e) => {
                e.stopPropagation();
                onRepClick(res.num, e);
              }}
            >
              返信({repCount})
            </span>
          )}
        </header>
        <ResBody
          messageHtml={resolvedMedia.messageHtml}
          searchQuery={searchQuery}
          anchorPreviewDepth={0}
          ngResNums={ngResNums}
          onUrlClick={(url, button, mode) => onUrlClick(url, undefined, button, mode)}
          onUrlContextMenu={(url, e, mode) => onUrlContextMenu(url, e, mode)}
          onIdLinkClick={onIdClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
        />
        <ResMediaGallery
          urls={resolvedMedia.urls}
          onUrlClick={onUrlClick}
          isBlurred={isImageBlurred}
          imageBlurRadius={imageBlurRadius}
        />
      </article>
    );
  },
);
ResItem.displayName = "ResItem"; // --- 個別レス表示 ---

export interface ResItemProps {
  res: IRes;
  idPos: number;
  idCount: number;
  repCount: number;
  miniAa: boolean;
  messageProtocol: string;
  onIdClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  /** url: クリックされたURL, resImages: 同レス内の全画像URL（ビューア前後移動用、省略可） */
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onContextMenu: (e: React.MouseEvent, res: IRes) => void;
  isOwn: boolean;
  isReplyToOwn: boolean;
  isImageBlurred: boolean;
  imageBlurRadius: number;
  ngResNums?: ReadonlySet<number>;
  /** アルバムAPIの失敗抑止をスレッド単位で分離するためのキー */
  threadUrl?: string;
  searchQuery?: string;
}
