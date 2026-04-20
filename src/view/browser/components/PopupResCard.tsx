import React, { useMemo, useRef } from "react";
import type { IRes } from "src/service-container";
import { ResBody } from "src/view/browser/components/ResBody";
import type {
  UrlClickHandler,
  UrlContextMenuHandler,
} from "src/view/browser/utils/link-routing";
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
    isHighlighted,
    onUrlClick,
    onUrlContextMenu,
    onLinkMiddleClickStart,
    onIdLinkClick,
    onRepClick,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
    onContextMenu,
  }) => {
    const handledMiddleClickThumbUrlRef = useRef<string | null>(null);
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

    // NG 判定は ResItem と同じロジック
    const isNG = res.ng != null || res.class?.includes("ng");
    if (isNG) return null;

    return (
      <article
        className={`res${isHighlighted ? " res--highlighted-persistent" : ""}`}
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
          onUrlClick={(url, button, mode) =>
            onUrlClick(url, undefined, button, mode)
          }
          onUrlContextMenu={(url, e, mode) => onUrlContextMenu(url, e, mode)}
          onMiddleClickStart={onLinkMiddleClickStart}
          onIdLinkClick={onIdLinkClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
        />
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
                onMouseDown={(e) => {
                  if (e.button !== 1) {
                    return;
                  }
                  // ポップアップ内 middle click は mouseleave close と競合しやすいため、
                  // 先に suppress を張ってから新規タブ側ハンドラを実行する。
                  onLinkMiddleClickStart?.();
                  e.preventDefault();
                  e.stopPropagation();
                  handledMiddleClickThumbUrlRef.current = raw;
                  onUrlClick(
                    raw,
                    imageUrls.map((x) => x.raw),
                    1,
                  );
                }}
                onAuxClick={(e) => {
                  if (e.button !== 1) {
                    return;
                  }
                  onLinkMiddleClickStart?.();
                  e.preventDefault();
                  e.stopPropagation();
                  if (handledMiddleClickThumbUrlRef.current === raw) {
                    handledMiddleClickThumbUrlRef.current = null;
                    return;
                  }
                  onUrlClick(
                    raw,
                    imageUrls.map((x) => x.raw),
                    1,
                  );
                }}
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
  isHighlighted?: boolean;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onLinkMiddleClickStart?: () => void;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
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
