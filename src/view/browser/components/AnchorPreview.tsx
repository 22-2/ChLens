import React, { useEffect, useRef, useState } from "react";
import type { IRes } from "src/service-container";
import { PopupResCard } from "src/view/browser/components/PopupResCard";

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
  onResContextMenu,
  hasChildPopup,
  zIndex,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const onMouseLeaveRef = useRef(onMouseLeave);
  onMouseLeaveRef.current = onMouseLeave;

  // x/y が変わるたびに位置リセット＋ビューポートはみ出し補正を再実行する
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // まず style をリセットして指定位置に戻す
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    // レイアウト確定後にはみ出し補正を実行
    const raf = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const cb = el.offsetParent?.getBoundingClientRect() ?? {
        left: 0,
        top: 0,
      };
      const margin = 8;
      if (rect.right > window.innerWidth) {
        el.style.left = `${window.innerWidth - rect.width - margin - cb.left}px`;
      }
      if (rect.bottom > window.innerHeight) {
        el.style.top = `${window.innerHeight - rect.height - margin - cb.top}px`;
      }
      if (rect.left < 0) {
        el.style.left = `${margin - cb.left}px`;
      }
      if (rect.top < 0) {
        el.style.top = `${margin - cb.top}px`;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [x, y]);

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
      onMouseEnter={() => {
        setIsHovering(true);
        onMouseEnter();
      }}
      onMouseLeave={(e) => {
        if (e.relatedTarget instanceof Node && ref.current?.contains(e.relatedTarget)) {
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
