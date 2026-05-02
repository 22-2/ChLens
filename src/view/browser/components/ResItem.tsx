import React, { useMemo } from "react";
import type { IRes } from "src/service-container";
import { ResBody } from "src/view/browser/components/ResBody";
import { useNgStatus } from "src/view/browser/hooks/use-ng-status";
import { getIdHeatColor } from "src/view/browser/utils/id-heat";
import type {
  UrlClickHandler,
  UrlContextMenuHandler,
} from "src/view/browser/utils/link-routing";
import { getReplyHeatLevel } from "src/view/browser/utils/reply-heat";
import {
  decodeResponseHtml,
  extractUrlsFromMessage,
  toViewerImageUrl,
} from "src/view/browser/utils/utils";

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
  }) => {
    const { isNgTemporarilyDisabled } = useNgStatus();
    // res.ng はサービス層がNGワード照合した結果を格納するフィールド。
    // 古いビューは class[] の "ng" 要素で判定していたが、new viewでは res.ng を優先チェックする。
    // 一時解除中はデータ自体を消さずに表示判定だけをオフにして、復帰時の再評価コストを避ける。
    const isNG =
      !isNgTemporarilyDisabled &&
      (res.ng != null || res.class?.includes("ng"));
    const decoded = useMemo(
      () => decodeResponseHtml(res, messageProtocol),
      [messageProtocol, res],
    );
    const urls = useMemo(
      () => extractUrlsFromMessage(decoded.messageHtml),
      [decoded.messageHtml],
    );
    const imageUrls = useMemo(
      () =>
        urls
          .map((url) => ({ raw: url, src: toViewerImageUrl(url) }))
          .filter((x) => !!x.src),
      [urls],
    );
    const replyHeat = getReplyHeatLevel(repCount);
    const resNumClassName = `res__num${
      replyHeat === "hot"
        ? " res__num--hot"
        : replyHeat === "warm"
          ? " res__num--warm"
          : ""
    }`;
    const repClassName = `res__rep${
      replyHeat === "hot"
        ? " res__rep--hot"
        : replyHeat === "warm"
          ? " res__rep--warm"
          : " res__rep--link"
    }`;

    return (
      <article
        data-res-num={res.num}
        className={`res${isNG ? " res--ng" : ""}${miniAa ? " res--aa" : ""}`}
        onContextMenu={(e) => {
          if (
            e.target instanceof Element &&
            e.target.closest("a, .res__link, .res__thumb")
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
            className="res__name"
            dangerouslySetInnerHTML={{ __html: decoded.nameHtml }}
          />
          {res.id && (
            <span
              className={`res__id${
                idCount >= 5
                  ? " res__id--freq"
                  : idCount >= 2
                    ? " res__id--link"
                    : ""
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
          onUrlClick={(url, button, mode) =>
            onUrlClick(url, undefined, button, mode)
          }
          onUrlContextMenu={(url, e, mode) => onUrlContextMenu(url, e, mode)}
          onIdLinkClick={onIdClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
        />
        {urls.length > 0 && (
          <div className="res__links">
            {urls.map((url) => (
              <a
                key={`${res.num}:${url}`}
                href={url}
                className="res__link"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUrlClick(url, undefined, 0);
                }}
                onMouseDown={(e) => {
                  if (e.button !== 1) {
                    return;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onAuxClick={(e) => {
                  if (e.button !== 1) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onUrlClick(url, undefined, 1);
                }}
                title={url}
              >
                {url}
              </a>
            ))}
          </div>
        )}
        {imageUrls.length > 0 && (
          <div className="res__thumbs">
            {imageUrls.map(({ raw, src }) => (
              <a
                key={`${res.num}:thumb:${raw}`}
                href={raw}
                className="res__thumb"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // 同レス内の全画像URLを渡してビューア内で前後移動できるようにする
                  onUrlClick(
                    raw,
                    imageUrls.map((x) => x.raw),
                    0,
                  );
                }}
                onMouseDown={(e) => {
                  if (e.button !== 1) {
                    return;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onAuxClick={(e) => {
                  if (e.button !== 1) {
                    return;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                  onUrlClick(
                    raw,
                    imageUrls.map((x) => x.raw),
                    1,
                  );
                }}
                title={raw}
              >
                <img src={src ?? ""} alt={raw} loading="lazy" />
              </a>
            ))}
          </div>
        )}
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
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onContextMenu: (e: React.MouseEvent, res: IRes) => void;
}
