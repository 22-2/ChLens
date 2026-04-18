import { useRef, useState } from "react";
import React from "react";
import { createPortal } from "react-dom";
import type { IRes } from "src/service-container";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { ReplyTree } from "src/view/browser/components/ReplyTree";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";

interface InternalContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

// --- 返信ツリーポップアップ ---
export const ReplyTreePopup: React.FC<{
  x: number;
  y: number;
  resNum: number;
  repIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
  messageProtocol: string;
  anchorPreviewDepth: number;
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
  /** コンテキストメニューの項目を生成する関数（ポップアップ内レス用） */
  buildContextMenuItems: (res: IRes) => ContextMenuItem[];
  onClose: () => void;
  /** アンカープレビューとの親子関係制御用 */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** 子ポップアップが開いている間は外側クリック閉じを無効にする */
  disableOutsideClick?: boolean;
  /** z-indexを明示指定（省略時はCSSのデフォルト値を使用） */
  zIndex?: number;
}> = ({
  x,
  y,
  resNum,
  repIndex,
  resMap,
  messageProtocol,
  anchorPreviewDepth,
  onUrlClick,
  onUrlContextMenu,
  onRepClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  buildContextMenuItems,
  onClose,
  onMouseEnter,
  onMouseLeave,
  disableOutsideClick,
  zIndex,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] =
    useState<InternalContextMenuState | null>(null);

  // スクロールコンテナ内での position:absolute に対応したオーバーフロー補正
  useAdjustOverflow(ref);

  const handleMouseLeave = () => {
    // 子ポップアップまたはContextMenuが開いている間は親を閉じない。
    if (disableOutsideClick || contextMenu != null) return;
    onClose();
  };

  const handleResContextMenu = (e: React.MouseEvent, targetRes: IRes) => {
    e.stopPropagation();
    // createPortalでbody直下に描画するため、viewport座標をそのまま使う。
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: buildContextMenuItems(targetRes),
    });
  };

  return (
    <div
      ref={ref}
      className="res-popup"
      style={{ left: x, top: y, ...(zIndex != null && { zIndex }) }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={(e) => {
        onMouseLeave?.();
        if (e.relatedTarget instanceof Node && ref.current?.contains(e.relatedTarget)) {
          return;
        }
        handleMouseLeave();
      }}
    >
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
          anchorPreviewDepth={anchorPreviewDepth}
          onUrlClick={onUrlClick}
          onUrlContextMenu={onUrlContextMenu}
          onRepClick={onRepClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
          onResContextMenu={handleResContextMenu}
          visited={new Set()}
          depth={0}
        />
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
