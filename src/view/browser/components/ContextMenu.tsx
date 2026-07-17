import type { ReactNode, RefObject } from "react";
import React, { useEffect, useMemo, useRef } from "react";
import { usePopupSurfaceLifecycle } from "src/view/browser/hooks/use-popup-manager";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";

export interface ContextMenuItem {
  id: string;
  label?: string;
  allowMultilineLabel?: boolean;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onSelect?: () => void;
  onAuxSelect?: (button: number) => void;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  onMouseEnter?: () => void;
  onSurfaceMouseDown?: () => void;
  closeDisabled?: boolean;
  zIndex?: number;
}

export const ContextMenu: React.FC<Props> = ({
  x,
  y,
  items,
  onClose,
  triggerRef,
  popupId,
  isPopupDescendantOf,
  onEnterFromDescendant,
  onMouseEnter,
  onSurfaceMouseDown,
  closeDisabled,
  zIndex,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    handleAuxClickCapture,
    handleMouseDownCapture,
    handleMouseEnter,
    handleMouseLeave,
  } = usePopupSurfaceLifecycle({
    surfaceRef: menuRef,
    outsideClickIgnoreRefs: triggerRef ? [triggerRef] : undefined,
    popupId,
    isPopupDescendantOf,
    onEnterFromDescendant,
    closeDisabled,
    // コンテキストメニューは hover/mouseleave で閉じると誤操作になりやすいため、
    // 明示操作（outside click / 選択 / Escape）だけで閉じる。
    closeOnMouseLeave: false,
    onClose,
    onSurfaceMouseDown,
    onSurfaceMouseEnter: onMouseEnter,
  });

  const visibleItems = useMemo(
    () => items.filter((item) => item.separator || item.label),
    [items],
  );

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const id = requestAnimationFrame(() => {
      document.addEventListener("keydown", handleEscape);
    });

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // スクロールコンテナ内での position:absolute に対応したオーバーフロー補正
  useAdjustOverflow(menuRef, 4);

  return (
    <div
      ref={menuRef}
      data-popup-surface="true"
      data-popup-id={popupId}
      className="context-menu"
      style={{ left: x, top: y, ...(zIndex != null && { zIndex }) }}
      onMouseDownCapture={handleMouseDownCapture}
      onAuxClickCapture={handleAuxClickCapture}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {visibleItems.map((item) => {
        if (item.separator) {
          return <div key={item.id} className="context-menu__separator" />;
        }
        return (
          <button
            key={item.id}
            className={`context-menu__item${item.danger ? " context-menu__item--danger" : ""}${
              item.allowMultilineLabel ? " context-menu__item--multiline" : ""
            }`}
            disabled={item.disabled}
            title={item.label}
            // mousedown でフォーカスが移動するとページ上のテキスト選択が消えるため
            // preventDefault でフォーカス移動を抑止し、選択状態を維持する。
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!item.disabled && item.onSelect) {
                item.onSelect();
              }
              onClose();
            }}
            onAuxClick={(e) => {
              if (item.disabled || !item.onAuxSelect) return;
              // コンテキストメニューでも中クリック操作を拾えるようにして、
              // 履歴の「中クリックで新規タブ」を実現する。
              if (e.button === 1) {
                e.preventDefault();
              }
              item.onAuxSelect(e.button);
              onClose();
            }}
          >
            {item.icon && (
              <span className="context-menu__icon">{item.icon}</span>
            )}
            <span
              className={`context-menu__label${
                item.allowMultilineLabel
                  ? " context-menu__label--multiline"
                  : ""
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
