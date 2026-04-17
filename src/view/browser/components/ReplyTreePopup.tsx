import { useEffect, useRef } from "react";
import React from "react";
import type { IRes } from "src/service-container";
import { ReplyTree } from "src/view/browser/components/ReplyTree";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";

// --- 返信ツリーポップアップ ---
export const ReplyTreePopup: React.FC<{
  x: number;
  y: number;
  resNum: number;
  repIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
  messageProtocol: string;
  onUrlClick: (url: string, resImages?: string[]) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onResContextMenu: (e: React.MouseEvent, res: IRes) => void;
  onClose: () => void;
}> = ({
  x,
  y,
  resNum,
  repIndex,
  resMap,
  messageProtocol,
  onUrlClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onResContextMenu,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

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
        <span>{`>>${resNum} への返信ツリー`}</span>
        <button className="res-popup__close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="res-popup__body">
        <ReplyTree
          resNum={resNum}
          repIndex={repIndex}
          resMap={resMap}
          messageProtocol={messageProtocol}
          onUrlClick={onUrlClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
          onResContextMenu={onResContextMenu}
          visited={new Set()}
          depth={0}
        />
      </div>
    </div>
  );
};
