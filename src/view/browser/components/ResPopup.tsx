import { useEffect, useRef, useState } from "react";
import React from "react";
import type { IRes } from "src/service-container";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { PopupResCard } from "src/view/browser/components/PopupResCard";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";

interface InternalContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

// --- IDポップアップ ---
export const ResPopup: React.FC<{
  x: number;
  y: number;
  title: string;
  items: IRes[];
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
  /** コンテキストメニューの項目を生成する関数（ポップアップ内レス用） */
  buildContextMenuItems: (res: IRes) => ContextMenuItem[];
  onClose: () => void;
}> = ({
  x,
  y,
  title,
  items,
  messageProtocol,
  repIndex,
  onUrlClick,
  onRepClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  buildContextMenuItems,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] =
    useState<InternalContextMenuState | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // スクロールコンテナ内での position:absolute に対応したオーバーフロー補正
  useAdjustOverflow(ref);

  return (
    <div ref={ref} className="res-popup" style={{ left: x, top: y }}>
      <div className="res-popup__header">
        <span>{title}</span>
        <button className="res-popup__close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="res-popup__body">
        {items.map((res) => (
          <PopupResCard
            key={res.num}
            res={res}
            messageProtocol={messageProtocol}
            anchorPreviewDepth={0}
            repIndex={repIndex}
            onUrlClick={onUrlClick}
            onRepClick={onRepClick}
            onAnchorClick={onAnchorClick}
            onAnchorHover={onAnchorHover}
            onAnchorLeave={onAnchorLeave}
            onContextMenu={(e, targetRes) => {
              e.stopPropagation();
              // ContextMenu をポップアップ内に描画して、外側クリック検知との干渉を防ぐ
              const popupRect = ref.current!.getBoundingClientRect();
              setContextMenu({
                x: e.clientX - popupRect.left,
                y: e.clientY - popupRect.top,
                items: buildContextMenuItems(targetRes),
              });
            }}
          />
        ))}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
