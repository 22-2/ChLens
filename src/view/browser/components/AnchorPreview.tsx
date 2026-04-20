import React, { useEffect, useRef, useState } from "react";
import type { IRes } from "src/service-container";
import { PopupResCard } from "src/view/browser/components/PopupResCard";
import { usePopupSurfaceCloseGuard } from "src/view/browser/hooks/use-popup-manager";
import { POPUP_SURFACE_SELECTOR } from "src/view/browser/utils/constants";
import { useAdjustOverflow } from "../utils/use-adjust-overflow";
import { getEventTargetElement } from "src/view/browser/utils/utils";

export interface AnchorPreviewProps {
  depth: number;
  x: number;
  y: number;
  items: IRes[];
  label: string;
  messageProtocol: string;
  repIndex: Map<number, Set<number>>;
  onUrlClick: (url: string, resImages?: string[], button?: 0 | 1) => void;
  onUrlContextMenu: (url: string, e: React.MouseEvent) => void;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** 親popup自体を触った時は、このpreview配下の枝だけ閉じ直せるようにする。 */
  onSurfaceMouseDown?: () => void;
  /** 子メニューも親子スタックへ載せ、参照プレビューの早閉じを防ぐ。 */
  onResContextMenu: (targetRes: IRes, event: React.MouseEvent) => void;
  hasChildPopup?: boolean;
  /** z-indexを明示指定（後から開いたポップアップが前面に出るよう呼び出し元が管理する） */
  zIndex: number;
}

export const AnchorPreview: React.FC<AnchorPreviewProps> = ({
  depth,
  x,
  y,
  items,
  label,
  messageProtocol,
  repIndex,
  onUrlClick,
  onUrlContextMenu,
  onIdLinkClick,
  onRepClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onMouseEnter,
  onMouseLeave,
  onSurfaceMouseDown,
  onResContextMenu,
  hasChildPopup,
  zIndex,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const onMouseLeaveRef = useRef(onMouseLeave);
  const {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    shouldSuppressMouseLeaveClose,
  } = usePopupSurfaceCloseGuard(onSurfaceMouseDown);
  onMouseLeaveRef.current = onMouseLeave;

  const isActuallyHovering = () => ref.current?.matches(":hover") ?? false;

  useAdjustOverflow(ref);

  const prevHasChildPopupRef = useRef(!!hasChildPopup);
  useEffect(() => {
    const hadChildPopup = prevHasChildPopupRef.current;
    prevHasChildPopupRef.current = !!hasChildPopup;
    // 子プレビューを経由した移動では isHovering が残ることがあるため、
    // ステートではなく実 DOM の :hover を見て親の閉じ忘れを防ぐ。
    if (hadChildPopup && !hasChildPopup && !isActuallyHovering()) {
      setIsHovering(false);
      onMouseLeaveRef.current();
    }
  }, [hasChildPopup, isHovering]);

  useEffect(() => {
    if (hasChildPopup) return;
    const handler = (e: MouseEvent) => {
      const target = getEventTargetElement(e.target);
      if (target?.closest(POPUP_SURFACE_SELECTOR)) {
        return;
      }
      onMouseLeaveRef.current();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [hasChildPopup]);

  return (
    <div
      ref={ref}
      data-popup-surface="true"
      className="anchor-preview"
      style={{
        left: x,
        top: y,
        zIndex,
      }}
      onMouseDownCapture={handleMouseDownCapture}
      onAuxClickCapture={handleAuxClickCapture}
      onMouseEnter={() => {
        setIsHovering(true);
        onMouseEnter();
      }}
      onMouseLeave={(e) => {
        if (e.relatedTarget instanceof Node && ref.current?.contains(e.relatedTarget)) {
          return;
        }
        if (
          e.relatedTarget instanceof Element &&
          e.relatedTarget.closest(POPUP_SURFACE_SELECTOR)
        ) {
          return;
        }
        if (shouldSuppressMouseLeaveClose()) {
          return;
        }
        setIsHovering(false);
        if (hasChildPopup) return;
        onMouseLeave();
      }}
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
            onUrlClick={onUrlClick}
            onUrlContextMenu={onUrlContextMenu}
            onLinkMiddleClickStart={armMouseLeaveCloseSuppression}
            onIdLinkClick={onIdLinkClick}
            onRepClick={onRepClick}
            onAnchorClick={onAnchorClick}
            onAnchorHover={onAnchorHover}
            onAnchorLeave={onAnchorLeave}
            onContextMenu={(e, targetRes) => {
              e.stopPropagation();
              onResContextMenu(targetRes, e);
            }}
          />
        ))}
      </div>
    </div>
  );
};
AnchorPreview.displayName = "AnchorPreview";
