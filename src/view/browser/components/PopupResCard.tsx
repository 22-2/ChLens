import React, { useMemo, useRef } from "react";
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
  }) => {
    const { isNgTemporarilyDisabled } = useNgStatus();
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
    // idIndex が渡された場合のみ同一IDのレス数を表示してクリック可能にする
    const idCount = res.id ? (idIndex?.get(res.id)?.size ?? 0) : 0;

    // NG 判定は ResItem と同じロジック
    const isNG =
      !isNgTemporarilyDisabled &&
      (res.ng != null || res.class?.includes("ng"));
    if (isNG) return null;

    return (
      <article
        className={`res${isHighlighted ? " res--highlighted-persistent" : ""}`}
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          if (
            e.target instanceof Element &&
            e.target.closest("a, .res__thumb")
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
              className={`${repClassName}${
                disableRepClick ? " res__rep--disabled" : ""
              }`}
              aria-disabled={disableRepClick ? true : undefined}
              title={disableRepClick ? "参照元レスの返信はこのポップアップ内では開けません" : undefined}
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
              </a>
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
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onContextMenu?: (e: React.MouseEvent, res: IRes) => void;
}
