import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import React, { useRef } from "react";
import { usePopupSurfaceLifecycle } from "src/view/browser/hooks/use-popup-manager";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";

export interface FloatingSurfaceRenderProps {
  /** 子要素のリンク操作で mouseleave close を一時的に抑止する。 */
  armMouseLeaveCloseSuppression: () => void;
}

export interface FloatingSurfaceProps {
  className: string;
  x: number;
  y: number;
  zIndex?: CSSProperties["zIndex"];
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  closeDisabled?: boolean;
  closeOnMouseLeave?: boolean;
  onClose: () => void;
  onSurfaceMouseDown?: () => void;
  onSurfaceMouseEnter?: () => void;
  onSurfaceMouseLeave?: () => void;
  onMouseOver?: MouseEventHandler<HTMLDivElement>;
  children: ReactNode | ((props: FloatingSurfaceRenderProps) => ReactNode);
}

/**
 * Thread popupで共有する座標付きsurface。
 *
 * popupの親子関係や閉じ方はfeature側へ漏らさず、DOM属性・座標補正・
 * mouse lifecycleをここへ集約する。内容の描画だけはrender propで各featureが担当する。
 */
export const FloatingSurface: React.FC<FloatingSurfaceProps> = ({
  className,
  x,
  y,
  zIndex,
  popupId,
  isPopupDescendantOf,
  onEnterFromDescendant,
  closeDisabled,
  closeOnMouseLeave = true,
  onClose,
  onSurfaceMouseDown,
  onSurfaceMouseEnter,
  onSurfaceMouseLeave,
  onMouseOver,
  children,
}) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    handleMouseEnter,
    handleMouseLeave,
  } = usePopupSurfaceLifecycle({
    surfaceRef,
    popupId,
    isPopupDescendantOf,
    onEnterFromDescendant,
    closeDisabled,
    closeOnMouseLeave,
    onClose,
    onSurfaceMouseDown,
    onSurfaceMouseEnter,
    onSurfaceMouseLeave,
  });

  // position:absolute のpopupをviewport内へ収める補正は全surfaceで共通化する。
  useAdjustOverflow(surfaceRef);

  const content =
    typeof children === "function" ? children({ armMouseLeaveCloseSuppression }) : children;

  return (
    <div
      ref={surfaceRef}
      data-popup-surface="true"
      data-popup-id={popupId}
      className={className}
      style={{ left: x, top: y, ...(zIndex != null && { zIndex }) }}
      onMouseDownCapture={handleMouseDownCapture}
      onAuxClickCapture={handleAuxClickCapture}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseOver={onMouseOver}
    >
      {content}
    </div>
  );
};

FloatingSurface.displayName = "FloatingSurface";
