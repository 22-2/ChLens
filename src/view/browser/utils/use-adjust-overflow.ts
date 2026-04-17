import { RefObject, useEffect } from "react";

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
    // offsetParent の viewport 上の位置を取得し、absolute 座標系での補正量を計算する。
    // offsetParent が null (body 直下など) の場合は {left:0, top:0} とみなす。
    const cb = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };

    if (rect.right > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - margin - cb.left}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - margin - cb.top}px`;
    }
    if (rect.left < 0) {
      el.style.left = `${margin - cb.left}px`;
    }
    if (rect.top < 0) {
      el.style.top = `${margin - cb.top}px`;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
