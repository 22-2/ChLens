import { X } from "lucide-react";
import React, { useEffect, useRef } from "react";

export interface MiniWindowProps {
  title: string;
  /** トリガーボタンの getBoundingClientRect() を渡す。位置計算に使用する。 */
  anchor: DOMRect;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * VS Code の Quick Settings 風のミニポップアップ。
 * `anchor` をもとにステータスバーの真上へ fixed 配置される。
 * タイトルと閉じるボタンを持つ汎用シェルで、中身は children で差し替え可能。
 */
export const MiniWindow: React.FC<MiniWindowProps> = ({
  title,
  anchor,
  onClose,
  children,
}) => {
  const windowRef = useRef<HTMLDivElement>(null);

  // クリックアウトサイドで閉じる
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (
        windowRef.current &&
        !windowRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onClose]);

  // ESC キーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // ウィンドウリサイズ時は位置がずれるので閉じる
  useEffect(() => {
    window.addEventListener("resize", onClose);
    return () => window.removeEventListener("resize", onClose);
  }, [onClose]);

  const WINDOW_WIDTH = 280;
  const GAP = 4;

  // ステータスバーの上に表示するため bottom 基準で配置する
  const bottom = window.innerHeight - anchor.top + GAP;
  const left = Math.max(
    GAP,
    Math.min(anchor.left, window.innerWidth - WINDOW_WIDTH - GAP),
  );

  return (
    <div
      ref={windowRef}
      className="mini-window"
      style={{ bottom, left, width: WINDOW_WIDTH }}
    >
      <div className="mini-window__header">
        <span className="mini-window__title">{title}</span>
        <button
          className="mini-window__close"
          onClick={onClose}
          title="閉じる"
        >
          <X size={13} />
        </button>
      </div>
      <div className="mini-window__body">{children}</div>
    </div>
  );
};
