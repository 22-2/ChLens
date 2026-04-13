import { useMemo } from "node_modules/@types/react";
import React from "react";
import type { IRes } from "src/service-container";
import { ResBody } from "src/view/browser/pages/ResBodyProps";
import { decodeResponseHtml } from "src/view/browser/pages/utils";

export const PopupResCard: React.FC<StaticResCardProps> = React.memo(
  ({
    res,
    messageProtocol,
    anchorPreviewDepth,
    onUrlClick,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
    onContextMenu,
  }) => {
    const decoded = useMemo(
      () => decodeResponseHtml(res, messageProtocol),
      [messageProtocol, res],
    );

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
        </header>
        <ResBody
          messageHtml={decoded.messageHtml}
          anchorPreviewDepth={anchorPreviewDepth}
          onUrlClick={onUrlClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
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
  onUrlClick: (url: string) => void;
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
