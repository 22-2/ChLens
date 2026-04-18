import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IRes } from "src/service-container";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { PopupResCard } from "src/view/browser/components/PopupResCard";

interface InternalContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export interface AnchorPreviewProps {
  depth: number;
  x: number;
  y: number;
  items: IRes[];
  label: string;
  messageProtocol: string;
  repIndex: Map<number, Set<number>>;
  onUrlClick: (url: string, resImages?: string[]) => void;
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
  buildContextMenuItems: (res: IRes) => ContextMenuItem[];
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
  onRepClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onMouseEnter,
  onMouseLeave,
  buildContextMenuItems,
  zIndex,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] =
    useState<InternalContextMenuState | null>(null);

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

  const handleMouseLeave = () => {
    // コンテキストメニューが開いている間はポップアップを閉じない
    if (contextMenu) return;
    onMouseLeave();
  };

  return (
    <div
      ref={ref}
      className="anchor-preview"
      style={{
        left: x,
        top: y,
        zIndex,
      }}
      onMouseEnter={onMouseEnter}
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
            onUrlClick={onUrlClick}
            onRepClick={onRepClick}
            onAnchorClick={onAnchorClick}
            onAnchorHover={onAnchorHover}
            onAnchorLeave={onAnchorLeave}
            onContextMenu={(e, targetRes) => {
              e.stopPropagation();
              // createPortalでbody直下に描画するため、viewport座標をそのまま使う。
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: buildContextMenuItems(targetRes),
              });
            }}
          />
        ))}
      </div>
      {contextMenu &&
        createPortal(
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={() => setContextMenu(null)}
          />,
          document.body,
        )}
    </div>
  );
};
AnchorPreview.displayName = "AnchorPreview";
