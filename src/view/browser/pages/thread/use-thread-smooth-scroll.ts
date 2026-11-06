import Lenis from "lenis";
import { type RefObject, useEffect, useState } from "react";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { readConfigValue, subscribeConfigKeys } from "src/view/browser/utils/config-setting";

const MULTIPLIER_KEY = "thread_scroll_multiplier";
const MULTIPLIERS = ["1", "1.5", "2", "3"];

function readMultiplier(): number {
  const value = readConfigValue(MULTIPLIER_KEY);
  return value && MULTIPLIERS.includes(value) ? Number(value) : 1.5;
}

interface SmoothScrollOptions {
  containerRef: RefObject<HTMLElement | null>;
  rootRef: RefObject<HTMLElement | null>;
  isActive: boolean;
  activeTopBar: string;
  loading: boolean;
  canRefresh: boolean;
}

export function useThreadSmoothScroll({
  containerRef,
  rootRef,
  isActive,
  activeTopBar,
  loading,
  canRefresh,
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
      wheelMultiplier: multiplier,
      virtualScroll: ({ event }) => {
        // 更新・フィルタ開閉が消費したホイールや、内側のスクロールを横取りしない。
        if (event.defaultPrevented) return false;
        for (const node of event.composedPath()) {
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
    let frame = 0;
    const tick = (time: number) => {
      // レスジャンプや仮想リストによる位置補正を、慣性が元へ引き戻さないようにする。
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
      lenis.destroy();
    };
    // フィルタと更新のリスナーが付け直された後にLenisを登録し、先に操作を判定させる。
  }, [
    activeTopBar,
    canRefresh,
    containerRef,
    enabled,
    isActive,
    loading,
    multiplier,
    rootRef,
    viewWindow,
  ]);
}
