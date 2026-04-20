import { useEffect, useRef, useState } from "react";
import type React from "react";
import { usePopupSurfaceCloseGuard } from "src/view/browser/hooks/use-popup-surface-close-guard";
import { POPUP_SURFACE_SELECTOR } from "src/view/browser/utils/constants";
import { getEventTargetElement } from "src/view/browser/utils/utils";

interface PopupSurfaceLifecycleParams {
  closeDisabled?: boolean;
  onClose: () => void;
  onSurfaceMouseDown?: () => void;
  onSurfaceMouseEnter?: () => void;
  onSurfaceMouseLeave?: () => void;
}

interface PopupSurfaceLifecycleResult {
  armMouseLeaveCloseSuppression: () => void;
  handleAuxClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
  handleMouseDownCapture: (event: React.MouseEvent<HTMLElement>) => void;
  handleMouseEnter: () => void;
  handleMouseLeave: (event: React.MouseEvent<HTMLElement>) => void;
}

export function usePopupSurfaceLifecycle({
  closeDisabled,
  onClose,
  onSurfaceMouseDown,
  onSurfaceMouseEnter,
  onSurfaceMouseLeave,
}: PopupSurfaceLifecycleParams): PopupSurfaceLifecycleResult {
  const [isHovering, setIsHovering] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    shouldSuppressMouseLeaveClose,
  } = usePopupSurfaceCloseGuard(onSurfaceMouseDown);

  const prevCloseDisabledRef = useRef(!!closeDisabled);
  useEffect(() => {
    const wasDisabled = prevCloseDisabledRef.current;
    prevCloseDisabledRef.current = !!closeDisabled;
    // 子popupが閉じた直後に mouseleave を取り逃したケースは、
    // closeDisabled の解除タイミングで hover 状態を見て補完 close する。
    if (wasDisabled && !closeDisabled && !isHovering) {
      onCloseRef.current();
    }
  }, [closeDisabled, isHovering]);

  useEffect(() => {
    if (closeDisabled) {
      return;
    }
    const handleOutsideMouseDown = (event: MouseEvent) => {
      const target = getEventTargetElement(event.target);
      if (target?.closest(POPUP_SURFACE_SELECTOR)) {
        return;
      }
      onCloseRef.current();
    };
    document.addEventListener("mousedown", handleOutsideMouseDown);
    return () => document.removeEventListener("mousedown", handleOutsideMouseDown);
  }, [closeDisabled]);

  const handleMouseEnter = () => {
    setIsHovering(true);
    onSurfaceMouseEnter?.();
  };

  const handleMouseLeave = (event: React.MouseEvent<HTMLElement>) => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    if (
      event.relatedTarget instanceof Element &&
      event.relatedTarget.closest(POPUP_SURFACE_SELECTOR)
    ) {
      return;
    }
    if (shouldSuppressMouseLeaveClose()) {
      return;
    }
    // popup surface 間の移動では親子チェーンを維持し、
    // 実際に surface 外へ出た時だけ leave callback と close 判定を走らせる。
    onSurfaceMouseLeave?.();
    setIsHovering(false);
    if (closeDisabled) {
      return;
    }
    onCloseRef.current();
  };

  return {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    handleMouseEnter,
    handleMouseLeave,
  };
}
