import { useMemo } from "react";
import React from "react";
import type { IRes } from "src/service-container";
import { ResBody } from "src/view/browser/components/ResBody";
import {
  decodeResponseHtml,
  extractUrlsFromMessage,
  toViewerImageUrl,
} from "src/view/browser/utils/utils";

export const PopupResCard: React.FC<StaticResCardProps> = React.memo(
  ({
    res,
    messageProtocol,
    anchorPreviewDepth,
    repIndex,
    onUrlClick,
    onRepClick,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
    onContextMenu,
  }) => {
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

    // repIndex が渡された場合のみ返信数を表示する
    const repCount = repIndex?.get(res.num)?.size ?? 0;

    return (
      <article
        className="res"
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          e.preventDefault();
          onContextMenu(e, res);
        }}
      >
        <header className="res__header">
          <span className="res__num">{res.num}</span>
          <span
            className="res__name"
            dangerouslySetInnerHTML={{ __html: decoded.nameHtml }}
          />
          {res.id && <span className="res__id">{res.id}</span>}
          <span className="res__date">{res.date ?? res.other}</span>
          {repCount > 0 && onRepClick && (
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
          anchorPreviewDepth={anchorPreviewDepth}
          onUrlClick={onUrlClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
        />
        {imageUrls.length > 0 && (
          <div className="res__thumbs">
            {imageUrls.map(({ raw, src }) => (
              <button
                key={`${res.num}:thumb:${raw}`}
                className="res__thumb"
                onClick={() =>
                  // 同レス内の全画像URLを渡してビューア内で前後移動できるようにする
                  onUrlClick(raw, imageUrls.map((x) => x.raw))
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
PopupResCard.displayName = "PopupResCard";
export interface StaticResCardProps {
  res: IRes;
  messageProtocol: string;
  anchorPreviewDepth: number;
  /** 渡された場合、ヘッダーに返信数ボタンを表示する */
  repIndex?: Map<number, Set<number>>;
  onUrlClick: (url: string, resImages?: string[]) => void;
  onRepClick?: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onContextMenu?: (e: React.MouseEvent, res: IRes) => void;
}
