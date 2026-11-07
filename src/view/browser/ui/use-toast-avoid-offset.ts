import { useEffect, useState } from "react";

/**
 * トーストが避けるべき領域に付ける属性。
 * 変更理由: 本文上部の通知（dat落ち・次スレ待機など）や検索バーとトーストが重なるたびに
 * 固定値のずらしをCSSへ足すとツギハギになるため、避けたい要素がこの属性を付けるだけで
 * ToastProviderが実際の下端を測って位置を決める。
 */
export const TOAST_AVOID_ATTRIBUTE = "data-toast-avoid";

/** 避ける領域とトーストの間に空ける余白(px)。 */
const TOAST_AVOID_GAP_PX = 8;

/** 表示中の避け対象の下端(px, ビューポート基準)の最大値。なければ0。 */
export function measureToastAvoidBottom(targetDocument: Document): number {
  let bottom = 0;
  for (const element of targetDocument.querySelectorAll(`[${TOAST_AVOID_ATTRIBUTE}]`)) {
    const rect = element.getBoundingClientRect();
    // 非表示タブや中身が空の領域は高さ0になるので無視する。
    if (rect.height <= 0 || rect.width <= 0) continue;
    bottom = Math.max(bottom, rect.bottom + TOAST_AVOID_GAP_PX);
  }
  return Math.round(bottom);
}

/** 避け対象の下端を監視し、変化したときだけ更新する。 */
export function useToastAvoidBottom(targetWindow: Window): number {
  const [bottom, setBottom] = useState(0);

  useEffect(() => {
    const targetDocument = targetWindow.document;
    let frame = 0;
    const update = () => {
      frame = 0;
      setBottom(measureToastAvoidBottom(targetDocument));
    };
    // DOM変更やリサイズは連続しやすいので、描画フレームごとに1回へまとめる。
    const schedule = () => {
      if (frame === 0) frame = targetWindow.requestAnimationFrame(update);
    };

    // 別窓のDOMも、メイン窓のObserverで監視できる。
    const resizeObserver = new ResizeObserver(schedule);
    const observeAvoidElements = () => {
      resizeObserver.disconnect();
      for (const element of targetDocument.querySelectorAll(`[${TOAST_AVOID_ATTRIBUTE}]`)) {
        resizeObserver.observe(element);
      }
    };
    const mutationObserver = new MutationObserver(() => {
      observeAvoidElements();
      schedule();
    });
    mutationObserver.observe(targetDocument.body, {
      childList: true,
      subtree: true,
      // タブ切り替えで表示中の領域が変わるため。
      attributes: true,
      attributeFilter: ["data-active"],
    });
    targetWindow.addEventListener("resize", schedule);
    observeAvoidElements();
    schedule();

    return () => {
      if (frame !== 0) targetWindow.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      targetWindow.removeEventListener("resize", schedule);
    };
  }, [targetWindow]);

  return bottom;
}
