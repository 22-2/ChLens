import React, { useCallback, useRef } from "react";
import type { IRes } from "src/service-container";
import { PopupResCard } from "src/view/browser/components/PopupResCard";
import { usePopupSurfaceLifecycle } from "src/view/browser/hooks/use-popup-manager";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";

// --- IDポップアップ ---
export const ResPopup: React.FC<{
  x: number;
  y: number;
  title: string;
  items: IRes[];
  messageProtocol: string;
  repIndex: Map<number, Set<number>>;
  idIndex?: Map<string, Set<number>>;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
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
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  /** 親popupをクリックした時に、その配下の枝だけ畳めるようにする。 */
  onSurfaceMouseDown?: () => void;
  /** 子ポップアップが開いている間は外側クリック閉じを無効にする */
  disableOutsideClick?: boolean;
  /** z-indexを明示指定（省略時はCSSのデフォルト値を使用） */
  zIndex?: number;
  /** ポップアップ内でも画像ぼかしを適用するためのセット */
  blurredResNums?: Set<number>;
}> = ({
  x,
  y,
  title,
  items,
  messageProtocol,
  repIndex,
  idIndex,
  onUrlClick,
  onUrlContextMenu,
  onIdLinkClick,
  onRepClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onResContextMenu,
  onClose,
  onMouseEnter,
  onMouseLeave,
  popupId,
  isPopupDescendantOf,
  onEnterFromDescendant,
  onSurfaceMouseDown,
  disableOutsideClick,
  zIndex,
  blurredResNums,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const handleResContextMenu = useCallback(
    (event: React.MouseEvent, targetRes: IRes) => {
      event.stopPropagation();
      // 右クリックの mousedown では選択保護のため子孫を畳まない設計なので、
      // 選択が確定した contextmenu のこの時点で配下の子孫ポップアップを畳む。
      onSurfaceMouseDown?.();
      onResContextMenu(targetRes, event);
    },
    [onResContextMenu, onSurfaceMouseDown],
  );
  const {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    handleMouseEnter,
    handleMouseLeave,
  } = usePopupSurfaceLifecycle({
    surfaceRef: ref,
    popupId,
    isPopupDescendantOf,
    onEnterFromDescendant,
    closeDisabled: disableOutsideClick,
    onClose,
    onSurfaceMouseDown,
    onSurfaceMouseEnter: onMouseEnter,
    onSurfaceMouseLeave: onMouseLeave,
  });

  // スクロールコンテナ内での position:absolute に対応したオーバーフロー補正
  useAdjustOverflow(ref);

  return (
    <div
      ref={ref}
      data-popup-surface="true"
      data-popup-id={popupId}
      className="res-popup"
      style={{ left: x, top: y, ...(zIndex != null && { zIndex }) }}
      onMouseDownCapture={handleMouseDownCapture}
      onAuxClickCapture={handleAuxClickCapture}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      // ポップアップ内のレス間マウス移動で ResBody の handleMouseLeave が起動した
      // アンカープレビュー hide タイマーをキャンセルする。mouseover はバブルするため、
      // 子孫要素への移動時も発火し、mouseenter と異なりポップアップ外からの進入に限定されない。
      onMouseOver={onMouseEnter}
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
            idIndex={idIndex}
            onUrlClick={onUrlClick}
            onUrlContextMenu={onUrlContextMenu}
            onLinkMiddleClickStart={armMouseLeaveCloseSuppression}
            onIdLinkClick={onIdLinkClick}
            onRepClick={onRepClick}
            onAnchorClick={onAnchorClick}
            onAnchorHover={onAnchorHover}
            onAnchorLeave={onAnchorLeave}
            onContextMenu={handleResContextMenu}
            isImageBlurred={blurredResNums?.has(res.num)}
          />
        ))}
      </div>
    </div>
  );
};
