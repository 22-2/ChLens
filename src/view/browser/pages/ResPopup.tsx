import { useRef, useEffect } from "node_modules/@types/react";
import React from "react";
import type { IRes } from "src/service-container";
import { PopupResCard } from "./PopupResCard";

// --- IDポップアップ ---
export const ResPopup: React.FC<{
  x: number;
  y: number;
  title: string;
  items: IRes[];
  messageProtocol: string;
  onUrlClick: (url: string) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onResContextMenu: (e: React.MouseEvent, res: IRes) => void;
  onClose: () => void;
}> = ({
  x, y, title, items, messageProtocol, onUrlClick, onAnchorClick, onAnchorHover, onAnchorLeave, onResContextMenu, onClose,
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

    // ビューポート内に収まるよう位置を補正
    useEffect(() => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        ref.current.style.left = `${window.innerWidth - rect.width - 8}px`;
      }
      if (rect.bottom > window.innerHeight) {
        ref.current.style.top = `${window.innerHeight - rect.height - 8}px`;
      }
    }, []);

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
              onUrlClick={onUrlClick}
              onAnchorClick={onAnchorClick}
              onAnchorHover={onAnchorHover}
              onAnchorLeave={onAnchorLeave}
              onContextMenu={onResContextMenu} />
          ))}
        </div>
      </div>
    );
  };
