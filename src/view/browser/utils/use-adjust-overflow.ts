import { RefObject, useEffect } from "react";

export interface PopupViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function getPopupViewportBounds(): PopupViewportBounds {
  const statusBar = document.querySelector(".status-bar");
  let bottom = window.innerHeight;

  if (statusBar instanceof HTMLElement) {
    const statusBarRect = statusBar.getBoundingClientRect();
    if (
      statusBarRect.height > 0 &&
      statusBarRect.top >= 0 &&
      statusBarRect.top < bottom
    ) {
      bottom = statusBarRect.top;
    }
  }

  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom,
    width: window.innerWidth,
    height: Math.max(0, bottom),
  };
}

/**
 * マウント後にポップアップ要素がビューポートからはみ出さないよう位置を補正するフック。
 *
 * position:absolute の場合は offsetParent の座標系（getBoundingClientRect）を使って
 * style.left / style.top を補正するため、スクロールコンテナ内に配置されていても正しく動作する。
 */
export function useAdjustOverflow(
  ref: RefObject<HTMLElement | null>,
  margin = 8,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const viewport = getPopupViewportBounds();
    // offsetParent の viewport 上の位置を取得し、absolute 座標系での補正量を計算する。
    // offsetParent が null (body 直下など) の場合は {left:0, top:0} とみなす。
    const cb = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };

    if (rect.right > viewport.right - margin) {
      el.style.left = `${viewport.right - rect.width - margin - cb.left}px`;
    }
    if (rect.bottom > viewport.bottom - margin) {
      el.style.top = `${viewport.bottom - rect.height - margin - cb.top}px`;
    }
    if (rect.left < viewport.left + margin) {
      el.style.left = `${viewport.left + margin - cb.left}px`;
    }
    if (rect.top < viewport.top + margin) {
      el.style.top = `${viewport.top + margin - cb.top}px`;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
