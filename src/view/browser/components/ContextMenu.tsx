import type { ReactNode } from "react";
import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  id: string;
  label?: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onSelect?: () => void;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<Props> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const visibleItems = useMemo(
    () => items.filter((item) => item.separator || item.label),
    [items],
  );

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const id = requestAnimationFrame(() => {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleEscape);
    });

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // 右・下のはみ出しを補正してから、左・上のはみ出しも補正する
    if (rect.right > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - 4}px`;
    }
    if (rect.left < 0) {
      el.style.left = "4px";
    }
    if (rect.top < 0) {
      el.style.top = "4px";
    }
  }, []);

  // position: absolute を親のtransformに影響されずに表示するため、bodyに直接マウントする
  return createPortal(
    <div ref={menuRef} className="context-menu" style={{ left: x, top: y }}>
      {visibleItems.map((item) => {
        if (item.separator) {
          return <div key={item.id} className="context-menu__separator" />;
        }
        return (
          <button
            key={item.id}
            className={`context-menu__item${item.danger ? " context-menu__item--danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled && item.onSelect) {
                item.onSelect();
              }
              onClose();
            }}
          >
            {item.icon && (
              <span className="context-menu__icon">{item.icon}</span>
            )}
            <span className="context-menu__label">{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
};
