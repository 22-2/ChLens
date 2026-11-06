import Lenis from "lenis";
import { type RefObject, useEffect, useState } from "react";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { readConfigValue, subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import { SCROLL_LAYOUT_CORRECTION_EVENT } from "src/view/browser/utils/scroll-layout-correction";

const MULTIPLIER_KEY = "thread_scroll_multiplier";
const MULTIPLIERS = ["1", "1.5", "2", "3"];
const SCROLL_LERP = 0.2;

function readMultiplier(): number {
  const value = readConfigValue(MULTIPLIER_KEY);
  return value && MULTIPLIERS.includes(value) ? Number(value) : 1.5;
}

interface SmoothScrollOptions {
  containerRef: RefObject<HTMLElement | null>;
  rootRef: RefObject<HTMLElement | null>;
  isActive: boolean;
}

export function useThreadSmoothScroll({
  containerRef,
  rootRef,
  isActive,
}: SmoothScrollOptions): void {
  const { value: enabled } = useConfigBooleanSetting("thread_smooth_scroll");
  const [multiplier, setMultiplier] = useState(readMultiplier);
  const { window: viewWindow } = useViewSurface();

  useEffect(() => subscribeConfigKeys([MULTIPLIER_KEY], () => setMultiplier(readMultiplier())), []);

  useEffect(() => {
    const wrapper = containerRef.current;
    const content = rootRef.current;
    if (!enabled || !isActive || !wrapper || !content) return;

    const lenis = new Lenis({
      wrapper,
      content,
      // パネル側の更新・フィルタ操作が先にホイールを処理できるよう、窓で受ける。
      eventsTarget: viewWindow,
      // 仮想リストの高さは更新直後に変化するため、遅延した寸法キャッシュで移動先を制限しない。
      naiveDimensions: true,
      wheelMultiplier: multiplier,
      // 操作後の余韻を短くし、移動量を変えずに早めに停止させる。
      lerp: SCROLL_LERP,
      virtualScroll: ({ event }) => {
        // 更新・フィルタ開閉が消費したホイールや、内側のスクロールを横取りしない。
        if (event.defaultPrevented) return false;
        const path = event.composedPath();
        if (!path.includes(wrapper)) return false;
        // 自動追従の末尾移動直後はscrollイベントがまだ届かないことがある。
        // 古い位置から慣性を始めると、最初の一回で大きく飛ぶ。
        if (
          lenis.isScrolling !== "smooth" &&
          Math.abs(wrapper.scrollTop - lenis.animatedScroll) > 2
        ) {
          lenis.stop();
          lenis.start();
        }
        for (const node of path) {
          if (node === wrapper) break;
          if (!(node instanceof (viewWindow as Window & typeof globalThis).Element)) continue;
          if (
            node.matches(
              '[data-popup="true"], .context-menu, .mini-window, .media-viewer, .bookmark-root-dialog',
            )
          )
            return false;
          const style = viewWindow.getComputedStyle(node);
          if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight)
            return false;
        }
        return true;
      },
    });
    const handleLayoutCorrection = () => {
      if (lenis.isScrolling !== "smooth") return;
      const remaining = lenis.targetScroll - lenis.animatedScroll;
      lenis.stop();
      lenis.start();
      lenis.scrollTo(wrapper.scrollTop + remaining, { programmatic: false, lerp: SCROLL_LERP });
    };
    wrapper.addEventListener(SCROLL_LAYOUT_CORRECTION_EVENT, handleLayoutCorrection);
    const unsubscribeScroll = lenis.on("scroll", () => {
      // ブラウザのscroll通知より先に高さを実測すると古い位置へ補正されるため、
      // 仮想リストへ各フレームの位置を同期してからResizeObserverを動かす。
      if (lenis.isScrolling === "smooth") {
        wrapper.dispatchEvent(new (viewWindow as Window & typeof globalThis).Event("scroll"));
      }
    });
    let frame = 0;
    const tick = (time: number) => {
      // レスジャンプなどの位置変更は古い慣性に戻されないようにする。
      if (
        lenis.isScrolling === "smooth" &&
        Math.abs(wrapper.scrollTop - lenis.animatedScroll) > 2
      ) {
        lenis.stop();
        lenis.start();
      }
      lenis.raf(time);
      frame = viewWindow.requestAnimationFrame(tick);
    };
    frame = viewWindow.requestAnimationFrame(tick);
    return () => {
      viewWindow.cancelAnimationFrame(frame);
      unsubscribeScroll();
      wrapper.removeEventListener(SCROLL_LAYOUT_CORRECTION_EVENT, handleLayoutCorrection);
      lenis.destroy();
    };
  }, [containerRef, enabled, isActive, multiplier, rootRef, viewWindow]);
}
