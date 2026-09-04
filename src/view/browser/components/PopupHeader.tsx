import { MoreVertical, PinOff } from "lucide-react";
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
      {pinned && onTogglePinned && (
        <button
          type="button"
          className="res-popup__icon-btn"
          onClick={onTogglePinned}
          aria-label="ピン留めを解除"
          title="ピン留めを解除"
        >
          {/* 固定中だけ解除操作を常設し、メニューを開かずに popup を解放できるようにする。 */}
          <PinOff size={14} />
        </button>
      )}
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
      <button type="button" className="res-popup__close" onClick={onClose} aria-label="閉じる">
        ✕
      </button>
    </div>
  </div>
);

PopupHeader.displayName = "PopupHeader";
