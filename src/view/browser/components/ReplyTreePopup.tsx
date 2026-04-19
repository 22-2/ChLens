import React from "react";
import { useEffect, useRef, useState } from "react";
import type { IRes } from "src/service-container";
import { ReplyTree } from "src/view/browser/components/ReplyTree";
import { POPUP_SURFACE_SELECTOR } from "src/view/browser/utils/constants";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";

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
  /** 親子関係つきのメニュースタックをThreadPage側で一元管理する。 */
  onResContextMenu: (targetRes: IRes, event: React.MouseEvent) => void;
  onClose: () => void;
  /** アンカープレビューとの親子関係制御用 */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** 親popupをクリックした時に、その配下の枝だけ畳めるようにする。 */
  onSurfaceMouseDown?: () => void;
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
  onResContextMenu,
  onClose,
  onMouseEnter,
  onMouseLeave,
  onSurfaceMouseDown,
  disableOutsideClick,
  zIndex,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  // スクロールコンテナ内での position:absolute に対応したオーバーフロー補正
  useAdjustOverflow(ref);

  // カーソルがポップアップ内にあるかを追跡する。
  // disableOutsideClick が true→false に変わる瞬間にカーソルが外にある場合、
  // mouseleave は既に無視済みのためこのフラグで自動 close を補完する。
  const [isHovering, setIsHovering] = useState(false);

  // onClose の参照を ref で保持し、古い参照を useEffect に取り込まないようにする
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 子ポップアップが閉じて disableOutsideClick が true→false に変わった瞬間、
  // カーソルがポップアップ外にある場合は自動的に閉じる。
  // （mouseleave は disableOutsideClick=true の間に既に発火・無視済みのため、ここで補完する）
  const prevDisableRef = useRef(!!disableOutsideClick);
  useEffect(() => {
    const wasDisabled = prevDisableRef.current;
    prevDisableRef.current = !!disableOutsideClick;
    if (wasDisabled && !disableOutsideClick && !isHovering) {
      onCloseRef.current();
    }
  }, [disableOutsideClick, isHovering]);

  // 子がいない状態（disableOutsideClick=false）では外側クリックでも閉じる
  useEffect(() => {
    if (disableOutsideClick) return;
    const handler = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(POPUP_SURFACE_SELECTOR)) {
        return;
      }
      if (ref.current) {
        onCloseRef.current();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [disableOutsideClick]);

  const handleMouseLeave = () => {
    // 子ポップアップや子メニューが開いている間は親を閉じない。
    if (disableOutsideClick) return;
    onClose();
  };

  const handleResContextMenu = (e: React.MouseEvent, targetRes: IRes) => {
    e.stopPropagation();
    onResContextMenu(targetRes, e);
  };

  return (
    <div
      ref={ref}
      data-popup-surface="true"
      className="res-popup"
      style={{ left: x, top: y, ...(zIndex != null && { zIndex }) }}
      onMouseDownCapture={() => {
        onSurfaceMouseDown?.();
      }}
      onMouseEnter={() => {
        setIsHovering(true);
        onMouseEnter?.();
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
        // popup surface間の移動では親子チェーンを維持したいので、
        // 実際にsurface外へ出た時だけleave callbackを流す。
        onMouseLeave?.();
        setIsHovering(false);
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
    </div>
  );
};
