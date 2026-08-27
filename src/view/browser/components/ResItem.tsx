import React, { useMemo, useState } from "react";
import type { IRes } from "src/service-container";
import { NgBadge } from "src/view/browser/components/NgBadge";
import { ResBody } from "src/view/browser/components/ResBody";
import { ResMediaGallery } from "src/view/browser/components/ResMediaGallery";
import { useIsNgTemporarilyDisabled } from "src/view/browser/hooks/use-ng-status";
import { getIdHeatColor } from "src/view/browser/utils/id-heat";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";
import { getReplyHeatLevel } from "src/view/browser/utils/reply-heat";
import { decodeResponseHtml } from "src/view/browser/utils/response-format";
import { extractUrlsFromMessage } from "src/view/browser/utils/url-media";

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
  }) => {
    const isNgTemporarilyDisabled = useIsNgTemporarilyDisabled();
    // res.ng はサービス層がNGワード照合した結果を格納するフィールド。
    // 古いビューは class[] の "ng" 要素で判定していたが、new viewでは res.ng を優先チェックする。
    // 一時解除中はデータ自体を消さずに表示判定だけをオフにして、復帰時の再評価コストを避ける。
    const isNgMatched = res.ng != null || res.class?.includes("ng");
    const isNG = !isNgTemporarilyDisabled && isNgMatched;
    const [isNgRevealed, setIsNgRevealed] = useState(false);
    const decoded = useMemo(() => decodeResponseHtml(res, messageProtocol), [messageProtocol, res]);
    const urls = useMemo(() => extractUrlsFromMessage(decoded.messageHtml), [decoded.messageHtml]);
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
    const articleClassName = [
      "res",
      miniAa ? "res--aa" : "",
      isOwn ? "res--own" : "",
      isReplyToOwn ? "res--reply-to-own" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const nameClassName = [
      "res__name",
      isOwn ? "res__name--own" : "",
      isReplyToOwn ? "res__name--reply-to-own" : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (isNG && !isNgRevealed) {
      return (
        <article
          data-res-num={res.num}
          className="res res--ng-placeholder"
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
          <span className={nameClassName} dangerouslySetInnerHTML={{ __html: decoded.nameHtml }} />
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
              {res.id}
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
          messageHtml={decoded.messageHtml}
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
          urls={urls}
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
}
