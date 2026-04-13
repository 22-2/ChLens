import { useMemo } from "node_modules/@types/react";
import React from "react";
import type { IRes } from "src/service-container";
import { ResBody } from "src/view/browser/pages/ResBodyProps";
import {
  decodeResponseHtml,
  extractUrlsFromMessage,
  toViewerImageUrl,
} from "src/view/browser/pages/utils";

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
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
    onContextMenu,
  }) => {
    const isNG = res.class?.includes("ng");
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
        onContextMenu={onContextMenu}
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
          onUrlClick={onUrlClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
        />
        {urls.length > 0 && (
          <div className="res__links">
            {urls.map((url) => (
              <button
                key={`${res.num}:${url}`}
                className="res__link"
                onClick={() => onUrlClick(url)}
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
                key={`${res.num}:thumb:${raw}`}
                className="res__thumb"
                onClick={() => onUrlClick(raw)}
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
  onUrlClick: (url: string) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}
