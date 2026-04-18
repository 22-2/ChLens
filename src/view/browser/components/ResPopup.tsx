import React from "react";
import { useEffect, useRef, useState } from "react";
import type { IRes } from "src/service-container";
import { PopupResCard } from "src/view/browser/components/PopupResCard";
import { POPUP_SURFACE_SELECTOR } from "src/view/browser/utils/constants";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";

// --- IDポップアップ ---
export const ResPopup: React.FC<{
  x: number;
  y: number;
  title: string;
  items: IRes[];
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
  /**
   * メニューを親ポップアップと同じスタックで管理し、
   * 子メニューのクリックで親が閉じないよう中央管理へ委譲する。
   */
  onResContextMenu: (targetRes: IRes, event: React.MouseEvent) => void;
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
  title,
  items,
  messageProtocol,
  repIndex,
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

  return (
    <div
      ref={ref}
      data-popup-surface="true"
      className="res-popup"
      style={{ left: x, top: y, ...(zIndex != null && { zIndex }) }}
      onMouseEnter={() => {
        setIsHovering(true);
        onMouseEnter?.();
      }}
      onMouseLeave={(e) => {
        onMouseLeave?.();
        if (e.relatedTarget instanceof Node && ref.current?.contains(e.relatedTarget)) {
          return;
        }
        setIsHovering(false);
        handleMouseLeave();
      }}
    >
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
