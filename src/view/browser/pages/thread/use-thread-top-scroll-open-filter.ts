import { useEffect } from "react";

import { findThreadScrollContainer } from "src/view/browser/utils/thread-read-state";

import type { TopBarMode } from "src/view/browser/pages/thread/use-thread-top-bar";

interface UseThreadTopScrollOpenFilterParams {
  activeTopBar: TopBarMode;
  isActive: boolean;
  openFilterToolbar: () => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

const TOP_SCROLL_TOLERANCE_PX = 1;

export function useThreadTopScrollOpenFilter({
  activeTopBar,
  isActive,
  openFilterToolbar,
  rootRef,
}: UseThreadTopScrollOpenFilterParams): void {
  useEffect(() => {
    if (!isActive || activeTopBar !== "none") {
      return;
    }

    const scrollContainer = findThreadScrollContainer(rootRef.current);
    if (!scrollContainer) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY >= 0) {
        return;
      }

      if (scrollContainer.scrollTop > TOP_SCROLL_TOLERANCE_PX) {
        return;
      }

      // 変更理由: スレ最上部でさらに上へ送った操作だけを「フィルタを見たい」意思として扱い、
      // 通常のスクロール途中やピンチズームでは誤ってツールバーを開かないようにする。
      openFilterToolbar();
    };

    scrollContainer.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      scrollContainer.removeEventListener("wheel", handleWheel);
    };
  }, [activeTopBar, isActive, openFilterToolbar, rootRef]);
}
