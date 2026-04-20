import React, { useMemo } from "react";
import type { IRes } from "src/service-container";
import { ResBody } from "src/view/browser/components/ResBody";
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
    // res.ng はサービス層がNGワード照合した結果を格納するフィールド。
    // 古いビューは class[] の "ng" 要素で判定していたが、new viewでは res.ng を優先チェックする。
    const isNG = res.ng != null || res.class?.includes("ng");
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

    return (
      <article
        data-res-num={res.num}
        className={`res${isNG ? " res--ng" : ""}${miniAa ? " res--aa" : ""}`}
        onContextMenu={(e) => onContextMenu(e, res)}
      >
        <header className="res__header">
          <span className="res__num">{res.num}</span>
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
              className={`res__rep${repCount >= 5 ? " res__rep--freq" : " res__rep--link"}`}
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
          onUrlClick={(url, button) => onUrlClick(url, undefined, button)}
          onUrlContextMenu={onUrlContextMenu}
          onIdLinkClick={onIdClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
        />
        {urls.length > 0 && (
          <div className="res__links">
            {urls.map((url) => (
              <button
                type="button"
                key={`${res.num}:${url}`}
                className="res__link"
                onClick={(e) => {
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
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUrlContextMenu(url, e);
                }}
                title={url}
              >
                {url}
              </button>
            ))}
          </div>
        )}
        {imageUrls.length > 0 && (
          <div className="res__thumbs">
            {imageUrls.map(({ raw, src }) => (
              <button
                type="button"
                key={`${res.num}:thumb:${raw}`}
                className="res__thumb"
                onClick={() =>
                  // 同レス内の全画像URLを渡してビューア内で前後移動できるようにする
                  onUrlClick(
                    raw,
                    imageUrls.map((x) => x.raw),
                    0,
                  )
                }
                title={raw}
              >
                <img src={src ?? ""} alt={raw} loading="lazy" />
              </button>
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
  onUrlClick: (url: string, resImages?: string[], button?: 0 | 1) => void;
  onUrlContextMenu: (url: string, e: React.MouseEvent) => void;
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
