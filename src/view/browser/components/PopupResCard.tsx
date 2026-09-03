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

export const PopupResCard: React.FC<StaticResCardProps> = React.memo(
  ({
    res,
    messageProtocol,
    anchorPreviewDepth,
    repIndex,
    idIndex,
    disableRepClick,
    isHighlighted,
    onUrlClick,
    onUrlContextMenu,
    onLinkMiddleClickStart,
    onIdLinkClick,
    onRepClick,
    onOpenRootReplyTree,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
    onContextMenu,
    isImageBlurred,
    ngResNums,
    resMap,
    threadKey,
  }) => {
    const isNgTemporarilyDisabled = useIsNgTemporarilyDisabled();
    const decoded = useMemo(() => decodeResponseHtml(res, messageProtocol), [messageProtocol, res]);
    const urls = useMemo(() => extractUrlsFromMessage(decoded.messageHtml), [decoded.messageHtml]);
    const resolvedMedia = useImgurAlbumMedia(decoded.messageHtml, urls, threadKey);

    // repIndex が渡された場合のみ返信数を表示する
    const repCount = repIndex?.get(res.num)?.size ?? 0;
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
    // idIndex が渡された場合のみ同一IDのレス数を表示してクリック可能にする
    const idCount = res.id ? (idIndex?.get(res.id)?.size ?? 0) : 0;

    // NG 判定は ResItem と同じロジック
    const isNgMatched = res.ng != null || res.class?.includes("ng");
    const isNG = !isNgTemporarilyDisabled && isNgMatched;
    const [isNgRevealed, setIsNgRevealed] = useState(false);
    if (isNG && !isNgRevealed) {
      return (
        <article
          className="res res--ng-placeholder"
          role="button"
          aria-label="クリックして内容を表示"
          tabIndex={0}
          onClick={() => setIsNgRevealed(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsNgRevealed(true);
            }
          }}
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
        className={`res${isHighlighted ? " res--highlighted-persistent" : ""}`}
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          if (
            e.target instanceof Element &&
            e.target.closest("a, .res__thumb, .res__media-embed")
          ) {
            // popup 内でもリンク/画像の右クリックは既定メニューを優先する。
            return;
          }
          e.preventDefault();
          onContextMenu(e, res);
        }}
      >
        <header className="res__header">
          <span className={resNumClassName}>{res.num}</span>
          <span className="res__name" dangerouslySetInnerHTML={{ __html: decoded.nameHtml }} />
          {isNgMatched ? <NgBadge result={res.ng} /> : null}
          {res.id && (
            <span
              className={`res__id${
                idCount >= 5 ? " res__id--freq" : idCount >= 2 ? " res__id--link" : ""
              }`}
              // popup側も本文と同じ色スケールを使い、ID密度の見え方を統一する。
              style={{ color: getIdHeatColor(idCount) }}
              onClick={(e) => {
                e.stopPropagation();
                onIdLinkClick(res.id!, e);
              }}
            >
              {res.id}
              {idCount >= 2 && `(${idCount})`}
            </span>
          )}
          <span className="res__date">{res.date ?? res.other}</span>
          {repCount > 0 && onRepClick && (
            <span
              className={`${repClassName}${disableRepClick ? " res__rep--disabled" : ""}`}
              aria-disabled={disableRepClick ? true : undefined}
              title={
                disableRepClick ? "参照元レスの返信はこのポップアップ内では開けません" : undefined
              }
              onClick={(e) => {
                // 参照元レスの「返信」は同一ツリーを再帰的に開いてしまうため、
                // 返信ポップアップ内では明示的に無効化する。
                if (disableRepClick) {
                  e.stopPropagation();
                  return;
                }
                e.stopPropagation();
                onRepClick(res.num, e);
              }}
            >
              返信({repCount})
            </span>
          )}
          {onOpenRootReplyTree && (
            <button
              type="button"
              className="res__open-root-tree-btn"
              onClick={(e) => {
                // アンカーの葉からでも議論の起点へ辿れるよう、
                // 返信ツリーの開始レスを呼び出し元で解決してから開く。
                e.stopPropagation();
                onOpenRootReplyTree(res.num, e);
              }}
            >
              ツリー先頭から
            </button>
          )}
        </header>
        <ResBody
          messageHtml={resolvedMedia.messageHtml}
          anchorPreviewDepth={anchorPreviewDepth}
          ngResNums={ngResNums}
          resMap={resMap}
          onUrlClick={(url, button, mode) => onUrlClick(url, undefined, button, mode)}
          onUrlContextMenu={(url, e, mode) => onUrlContextMenu(url, e, mode)}
          onMiddleClickStart={onLinkMiddleClickStart}
          onIdLinkClick={onIdLinkClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
        />
        <ResMediaGallery
          urls={resolvedMedia.urls}
          onUrlClick={onUrlClick}
          onMiddleClickStart={onLinkMiddleClickStart}
          openOnMiddleMouseDown
          isBlurred={isImageBlurred}
        />
      </article>
    );
  },
);
PopupResCard.displayName = "PopupResCard";
export interface StaticResCardProps {
  res: IRes;
  messageProtocol: string;
  anchorPreviewDepth: number;
  /** 渡された場合、ヘッダーに返信数ボタンを表示する */
  repIndex?: Map<number, Set<number>>;
  /** 渡された場合、ヘッダーのIDに同一IDのレス数を表示してクリック可能にする */
  idIndex?: Map<string, Set<number>>;
  /** 参照元レスの返信を再帰的に開くのを防ぐための無効化フラグ */
  disableRepClick?: boolean;
  isHighlighted?: boolean;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onLinkMiddleClickStart?: () => void;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onRepClick?: (resNum: number, e: React.MouseEvent) => void;
  onOpenRootReplyTree?: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onContextMenu?: (e: React.MouseEvent, res: IRes) => void;
  /** ポップアップ内でも画像ぼかしを適用するためのフラグ */
  isImageBlurred?: boolean;
  /** 本文中のアンカー先NGレスを強調するためのレス番号集合 */
  ngResNums?: ReadonlySet<number>;
  /** 本文アンカーの欠損判定をメインスレッドと揃えるためのレス索引 */
  resMap?: ReadonlyMap<number, unknown>;
  /** 親スレッドのURL。ポップアップでも同じ失敗抑止単位を使う。 */
  threadKey?: string;
}
