import { ContextMenu as RadixContextMenu } from "radix-ui";
import type { ReactNode, RefObject } from "react";
import React, { useLayoutEffect, useMemo, useRef } from "react";
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
  header?: ReactNode;
  triggerRef?: RefObject<HTMLElement | null>;
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  onMouseEnter?: () => void;
  onSurfaceMouseDown?: () => void;
  closeDisabled?: boolean;
  zIndex?: number;
}

/** Radix ContextMenuを既存の座標・popup lifecycle APIへ適合させる共通wrapper。 */
export const ContextMenu: React.FC<Props> = ({
  x,
  y,
  items,
  onClose,
  header,
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
  const triggerElementRef = useRef<HTMLSpanElement>(null);
  const { handleAuxClickCapture, handleMouseDownCapture, handleMouseEnter, handleMouseLeave } =
    usePopupSurfaceLifecycle({
      surfaceRef: menuRef,
      outsideClickIgnoreRefs: triggerRef ? [triggerRef] : undefined,
      popupId,
      isPopupDescendantOf,
      onEnterFromDescendant,
      closeDisabled,
      // コンテキストメニューは hover/mouseleave で閉じず、Radixのdismissとoutside clickだけで閉じる。
      closeOnMouseLeave: false,
      onClose,
      onSurfaceMouseDown,
      onSurfaceMouseEnter: onMouseEnter,
    });

  const visibleItems = useMemo(() => items.filter((item) => item.separator || item.label), [items]);

  const isPopupBranchTarget = (target: EventTarget | null) => {
    if (!popupId || !(target instanceof Element)) {
      return false;
    }

    const targetPopupId = target
      .closest('[data-popup-surface="true"]')
      ?.getAttribute("data-popup-id");
    return (
      targetPopupId === popupId ||
      (targetPopupId != null && isPopupDescendantOf?.(targetPopupId, popupId) === true)
    );
  };

  // Radixのvirtual anchorへ座標を渡すため、既存の「stateが生成されたら開く」契約を
  // contextmenuイベントへ変換する。これによりRadix側のfocus/dismissable layerを利用できる。
  useLayoutEffect(() => {
    const trigger = triggerElementRef.current;
    if (!trigger) {
      return;
    }

    trigger.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 2,
      }),
    );
  }, [x, y]);

  // スクロールコンテナ内での position:absolute に対応したオーバーフロー補正
  useAdjustOverflow(menuRef, 4);

  return (
    <RadixContextMenu.Root
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <RadixContextMenu.Trigger asChild>
        <span
          ref={triggerElementRef}
          aria-hidden="true"
          style={{
            position: "fixed",
            left: x,
            top: y,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      </RadixContextMenu.Trigger>
      <RadixContextMenu.Content
        asChild
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          if (closeDisabled || isPopupBranchTarget(event.target)) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (closeDisabled || isPopupBranchTarget(event.target)) {
            event.preventDefault();
          }
        }}
      >
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
          {header ? <div className="context-menu__header">{header}</div> : null}
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
                // mousedown でフォーカスが移動するとページ上のテキスト選択が消えるため、
                // preventDefault でフォーカス移動を抑止し、選択状態を維持する。
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (!item.disabled) {
                    item.onSelect?.();
                  }
                  onClose();
                }}
                onAuxClick={(event) => {
                  if (item.disabled || !item.onAuxSelect) return;
                  if (event.button === 1) {
                    event.preventDefault();
                  }
                  item.onAuxSelect(event.button);
                  onClose();
                }}
              >
                {item.icon && <span className="context-menu__icon">{item.icon}</span>}
                <span
                  className={`context-menu__label${
                    item.allowMultilineLabel ? " context-menu__label--multiline" : ""
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </RadixContextMenu.Content>
    </RadixContextMenu.Root>
  );
};
