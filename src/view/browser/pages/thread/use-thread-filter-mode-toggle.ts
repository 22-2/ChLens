import { useLayoutEffect } from "react";
import { registerThreadFilterModeToggle } from "src/view/browser/extension/page-actions";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { ThreadFilter } from "src/view/browser/types";

interface UseThreadFilterModeToggleParams {
  tabId: string;
  isActive: boolean;
  setFilter: (update: (current: ThreadFilter) => ThreadFilter) => void;
  openFilterToolbar: () => void;
}

/**
 * コマンドパレットからのフィルタモード切り替えを、表示中のスレッドタブへ適用する。
 *
 * 変更理由: フィルタの状態はThreadPageの中にあり、画面が操作の登録と解除を管理する。
 * 対象タブが表示中のときだけ反応させ、同じウィンドウ内の別スレッドを誤って絞り込まないようにする。
 */
export function useThreadFilterModeToggle({
  tabId,
  isActive,
  setFilter,
  openFilterToolbar,
}: UseThreadFilterModeToggleParams): void {
  const { window: viewWindow } = useViewSurface();

  // 同じタブのスレ遷移で、旧ページの解除と新ページの登録を同期させる。
  useLayoutEffect(() => {
    if (!isActive) return;
    // 表示している窓とタブにだけ登録し、非表示・別窓移動時には解除する。
    return registerThreadFilterModeToggle(viewWindow, tabId, (filter) => {
      // 同じモードをもう一度選ぶと「すべて」へ戻す。
      setFilter((current) => (current === filter ? "all" : filter));
      // 押したモードの結果を確認できるよう、フィルタバーも開いておく。
      openFilterToolbar();
    });
  }, [isActive, openFilterToolbar, setFilter, tabId, viewWindow]);
}
