import { MoreVertical, Pin, PinOff } from "lucide-react";
import type { MouseEventHandler, ReactNode, RefObject } from "react";
import React from "react";

interface PopupHeaderProps {
  title: ReactNode;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  menuLabel: string;
  onMenuClick: MouseEventHandler<HTMLButtonElement>;
  onClose: () => void;
  pinned?: boolean;
  onTogglePinned?: () => void;
}

/** IDポップアップと返信ツリーポップアップで共通するヘッダー操作。 */
export const PopupHeader: React.FC<PopupHeaderProps> = ({
  title,
  menuButtonRef,
  menuLabel,
  onMenuClick,
  onClose,
  pinned = false,
  onTogglePinned,
}) => (
  <div className="res-popup__header">
    <span>{title}</span>
    <div className="res-popup__header-actions">
      <button
        type="button"
        ref={menuButtonRef}
        className="res-popup__icon-btn"
        onClick={onMenuClick}
        aria-label={menuLabel}
        title={menuLabel}
      >
        <MoreVertical size={14} />
      </button>
      {/* ピン留め前もメニューを開かずに固定でき、固定中は同じ位置から解除できる。 */}
      <button
        type="button"
        className="res-popup__icon-btn"
        onClick={onTogglePinned}
        disabled={!onTogglePinned}
        aria-label={pinned ? "ピン留めを解除" : "ピン留め"}
        title={pinned ? "ピン留めを解除" : "ピン留め"}
        aria-pressed={pinned}
      >
        {pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
      </button>
      <button type="button" className="res-popup__close" onClick={onClose} aria-label="閉じる">
        ✕
      </button>
    </div>
  </div>
);

PopupHeader.displayName = "PopupHeader";
