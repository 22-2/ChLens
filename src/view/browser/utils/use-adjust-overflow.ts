import { useEffect, type RefObject } from "react";

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
    if (statusBarRect.height > 0 && statusBarRect.top >= 0 && statusBarRect.top < bottom) {
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
 * ポップアップ要素がビューポートからはみ出さないよう位置を補正する。
 *
 * position:absolute の場合は offsetParent の座標系（getBoundingClientRect）を使って
 * style.left / style.top を補正するため、スクロールコンテナ内に配置されていても正しく動作する。
 */
function adjustPopupOverflow(el: HTMLElement, margin: number): void {
  const rect = el.getBoundingClientRect();
  const viewport = getPopupViewportBounds();
  // offsetParent の viewport 上の位置を取得し、absolute 座標系での補正量を計算する。
  // offsetParent が null (body 直下など) の場合は {left:0, top:0} とみなす。
  const cb = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
  let nextLeft: number | null = null;
  let nextTop: number | null = null;

  if (rect.right > viewport.right - margin) {
    nextLeft = viewport.right - rect.width - margin - cb.left;
  }
  if (rect.bottom > viewport.bottom - margin) {
    nextTop = viewport.bottom - rect.height - margin - cb.top;
  }
  if (rect.left < viewport.left + margin) {
    nextLeft = viewport.left + margin - cb.left;
  }
  if (rect.top < viewport.top + margin) {
    nextTop = viewport.top + margin - cb.top;
  }

  // ResizeObserver の通知内で同じ値を書き戻すと、レイアウト再計算を連鎖させる。
  // 値が実際に変わる時だけ更新して、補正自身による無限通知を防ぐ。
  if (nextLeft != null) {
    const left = `${nextLeft}px`;
    if (el.style.left !== left) {
      el.style.left = left;
    }
  }
  if (nextTop != null) {
    const top = `${nextTop}px`;
    if (el.style.top !== top) {
      el.style.top = top;
    }
  }
}

/**
 * ポップアップの初期表示後も、寸法やビューポートの変化に追従して位置を補正するフック。
 *
 * 返信ツリーの追加レスや画像の読み込みで高さが変わるポップアップは、マウント時だけの
 * 補正では画面下端・ステータスバー領域へはみ出すため、全ポップアップで変化を監視する。
 */
export function useAdjustOverflow(ref: RefObject<HTMLElement | null>, margin = 8): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const adjust = () => adjustPopupOverflow(el, margin);
    adjust();

    window.addEventListener("resize", adjust);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            adjust();
          });
    resizeObserver?.observe(el);

    return () => {
      window.removeEventListener("resize", adjust);
      resizeObserver?.disconnect();
    };
  }, [margin, ref]);
}
