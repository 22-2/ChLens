import type { CSSProperties, MouseEventHandler, PointerEvent, ReactNode } from "react";
import React, { useRef } from "react";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { usePopupCloseBehavior } from "src/view/browser/hooks/use-popup-close-behavior";
import { POPUP_CLOSE_OUTSIDE_ONLY_CONFIG_KEY } from "src/view/browser/utils/popup-settings";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";

export interface FloatingPopupRenderProps {
  /** 子要素のリンク操作で mouseleave close を一時的に抑止する。 */
  armMouseLeaveCloseSuppression: () => void;
}

export interface FloatingPopupProps {
  className: string;
  x: number;
  y: number;
  aboveY?: number;
  zIndex?: CSSProperties["zIndex"];
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  closeDisabled?: boolean;
  closeOnMouseLeave?: boolean;
  closeOnOutsideClick?: boolean;
  pinned?: boolean;
  onClose: () => void;
  onPopupMouseDown?: () => void;
  onPopupMouseEnter?: () => void;
  onPopupMouseLeave?: () => void;
  onMouseOver?: MouseEventHandler<HTMLDivElement>;
  children: ReactNode | ((props: FloatingPopupRenderProps) => ReactNode);
}

/**
 * Thread popupで共有する座標付きの表示要素。
 *
 * popupの親子関係や閉じ方はfeature側へ漏らさず、DOM属性・座標補正・
 * mouse lifecycleをここへ集約する。内容の描画だけはrender propで各featureが担当する。
 */
export const FloatingPopup: React.FC<FloatingPopupProps> = ({
  className,
  x,
  y,
  aboveY,
  zIndex,
  popupId,
  isPopupDescendantOf,
  onEnterFromDescendant,
  closeDisabled,
  closeOnMouseLeave = true,
  closeOnOutsideClick = true,
  pinned = false,
  onClose,
  onPopupMouseDown,
  onPopupMouseEnter,
  onPopupMouseLeave,
  onMouseOver,
  children,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{
    pointerId: number;
    kind: "move" | "resize";
    x: number;
    y: number;
    left: number;
    top: number;
    width: number;
    height: number;
    minHeight: number;
  } | null>(null);
  const { value: closeOnlyOnOutsideClick } = useConfigBooleanSetting(
    POPUP_CLOSE_OUTSIDE_ONLY_CONFIG_KEY,
  );
  const {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    handleMouseEnter,
    handleMouseLeave,
  } = usePopupCloseBehavior({
    popupRef,
    popupId,
    isPopupDescendantOf,
    onEnterFromDescendant,
    closeDisabled,
    closeOnMouseLeave: closeOnMouseLeave && !closeOnlyOnOutsideClick,
    closeOnOutsideClick,
    onClose,
    onPopupMouseDown,
    onPopupMouseEnter,
    onPopupMouseLeave,
  });

  // position:absolute のpopupをviewport内へ収める補正は全popupで共通化する。
  // 固定中は利用者が画面外へ動かした位置や手動で変更した寸法を補正しない。
  useAdjustOverflow(popupRef, 8, aboveY, !pinned);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!pinned || event.button !== 0) return;
    const target = event.target as Element;
    if (typeof target.closest !== "function") return;
    const resize = target.closest("[data-popup-resize]");
    const header = target.closest(".res-popup__header");
    if (!resize && (!header || target.closest("button, a, input, select, textarea"))) return;
    const popup = event.currentTarget;
    const rect = popup.getBoundingClientRect();
    gestureRef.current = {
      pointerId: event.pointerId,
      kind: resize ? "resize" : "move",
      x: event.clientX,
      y: event.clientY,
      left: popup.offsetLeft,
      top: popup.offsetTop,
      width: rect.width,
      height: rect.height,
      minHeight: popup.querySelector<HTMLElement>(".res-popup__header")?.offsetHeight ?? 0,
    };
    popup.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!pinned || !gesture || gesture.pointerId !== event.pointerId) return;
    const popup = event.currentTarget;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.kind === "move") {
      popup.style.left = `${gesture.left + dx}px`;
      popup.style.top = `${gesture.top + dy}px`;
      return;
    }
    // 寸法制限は操作開始後にだけ外し、ピン留め直後は元の見た目を維持する。
    popup.style.maxWidth = "none";
    popup.style.maxHeight = "none";
    popup.style.minWidth = "0";
    popup.dataset.userResized = "true";
    popup.style.width = `${Math.max(gesture.minHeight, gesture.width + dx)}px`;
    popup.style.height = `${Math.max(gesture.minHeight, gesture.height + dy)}px`;
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId === event.pointerId) gestureRef.current = null;
  };

  const content =
    typeof children === "function" ? children({ armMouseLeaveCloseSuppression }) : children;

  return (
    <div
      ref={popupRef}
      data-popup="true"
      data-popup-id={popupId}
      data-pinned={pinned || undefined}
      className={className}
      style={{ left: x, top: y, ...(zIndex != null && { zIndex }) }}
      onMouseDownCapture={handleMouseDownCapture}
      onAuxClickCapture={handleAuxClickCapture}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseOver={onMouseOver}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
    >
      {content}
      {pinned && <div className="floating-popup__resize" data-popup-resize="true" />}
    </div>
  );
};

FloatingPopup.displayName = "FloatingPopup";
