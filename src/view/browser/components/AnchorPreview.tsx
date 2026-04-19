import React, { useEffect, useRef, useState } from "react";
import type { IRes } from "src/service-container";
import { PopupResCard } from "src/view/browser/components/PopupResCard";
import { POPUP_SURFACE_SELECTOR } from "src/view/browser/utils/constants";
import { useAdjustOverflow } from "../utils/use-adjust-overflow";

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
  onMouseLeaveRef.current = onMouseLeave;

  useAdjustOverflow(ref);

  const prevHasChildPopupRef = useRef(!!hasChildPopup);
  useEffect(() => {
    const hadChildPopup = prevHasChildPopupRef.current;
    prevHasChildPopupRef.current = !!hasChildPopup;
    if (hadChildPopup && !hasChildPopup && !isHovering) {
      onMouseLeaveRef.current();
    }
  }, [hasChildPopup, isHovering]);

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
      onMouseDownCapture={() => {
        onSurfaceMouseDown?.();
      }}
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
