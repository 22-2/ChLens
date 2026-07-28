import React, { useCallback, useRef } from "react";
import type { IRes } from "src/service-container";
import { PopupResCard } from "src/view/browser/components/PopupResCard";
import { usePopupSurfaceLifecycle } from "src/view/browser/hooks/use-popup-manager";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";

export interface AnchorPreviewProps {
  depth: number;
  x: number;
  y: number;
  items: IRes[];
  label: string;
  messageProtocol: string;
  repIndex: Map<number, Set<number>>;
  idIndex?: Map<string, Set<number>>;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onOpenRootReplyTree: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  /** 親popup自体を触った時は、このpreview配下の枝だけ閉じ直せるようにする。 */
  onSurfaceMouseDown?: () => void;
  /** 子メニューも親子スタックへ載せ、参照プレビューの早閉じを防ぐ。 */
  onResContextMenu: (targetRes: IRes, event: React.MouseEvent) => void;
  hasChildPopup?: boolean;
  /** z-indexを明示指定（後から開いたポップアップが前面に出るよう呼び出し元が管理する） */
  zIndex: number;
  /** ポップアップ内でも画像ぼかしを適用するためのセット */
  blurredResNums?: Set<number>;
}

export const AnchorPreview: React.FC<AnchorPreviewProps> = ({
  depth,
  x,
  y,
  items,
  label,
  messageProtocol,
  repIndex,
  idIndex,
  onUrlClick,
  onUrlContextMenu,
  onIdLinkClick,
  onRepClick,
  onOpenRootReplyTree,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onMouseEnter,
  onMouseLeave,
  popupId,
  isPopupDescendantOf,
  onEnterFromDescendant,
  onSurfaceMouseDown,
  onResContextMenu,
  hasChildPopup,
  zIndex,
  blurredResNums,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const handleResContextMenu = useCallback(
    (event: React.MouseEvent, targetRes: IRes) => {
      event.stopPropagation();
      // 右クリックの mousedown では選択保護のため子孫を畳まない設計なので、
      // 選択が確定した contextmenu のこの時点で配下の子孫ポップアップを畳む。
      onSurfaceMouseDown?.();
      onResContextMenu(targetRes, event);
    },
    [onResContextMenu, onSurfaceMouseDown],
  );
  const {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    handleMouseEnter,
    handleMouseLeave,
  } = usePopupSurfaceLifecycle({
    surfaceRef: ref,
    popupId,
    isPopupDescendantOf,
    onEnterFromDescendant,
    closeDisabled: hasChildPopup,
    onClose: onMouseLeave,
    onSurfaceMouseDown,
    onSurfaceMouseEnter: onMouseEnter,
  });

  useAdjustOverflow(ref);

  return (
    <div
      ref={ref}
      data-popup-surface="true"
      data-popup-id={popupId}
      className="anchor-preview"
      style={{
        left: x,
        top: y,
        zIndex,
      }}
      onMouseDownCapture={handleMouseDownCapture}
      onAuxClickCapture={handleAuxClickCapture}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="anchor-preview__title">参照: {label}</div>
      <div className="anchor-preview__body">
        {items.slice(0, 8).map((res) => (
          <PopupResCard
            key={res.num}
            res={res}
            messageProtocol={messageProtocol}
            anchorPreviewDepth={depth + 1}
            repIndex={repIndex}
            idIndex={idIndex}
            onUrlClick={onUrlClick}
            onUrlContextMenu={onUrlContextMenu}
            onLinkMiddleClickStart={armMouseLeaveCloseSuppression}
            onIdLinkClick={onIdLinkClick}
            onRepClick={onRepClick}
            onOpenRootReplyTree={onOpenRootReplyTree}
            onAnchorClick={onAnchorClick}
            onAnchorHover={onAnchorHover}
            onAnchorLeave={onAnchorLeave}
            onContextMenu={handleResContextMenu}
            isImageBlurred={blurredResNums?.has(res.num)}
          />
        ))}
      </div>
    </div>
  );
};
AnchorPreview.displayName = "AnchorPreview";
