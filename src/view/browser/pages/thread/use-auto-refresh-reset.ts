import { useEffect } from "react";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { useTabStore } from "src/view/browser/state/tabs/use-tab-store";

/** 自動更新できない位置（過去実況など）へ切り替わったら、保存済みの自動更新ONを解除する。 */
export function useAutoRefreshReset(
  dispatch: ReturnType<typeof useTabStore>["dispatch"],
  autoRefreshPageKey: string | null,
  tabAutoRefreshEnabled: boolean,
  { canAutoRefresh }: { canAutoRefresh: boolean },
): void {
  useEffect(() => {
    if (canAutoRefresh || !tabAutoRefreshEnabled || autoRefreshPageKey == null) return;
    // 既存タブが自動更新中でも、過去実況の位置へ切り替わった時点で保存状態も解除する。
    dispatch(tabActions.setAutoRefreshEnabled(false, autoRefreshPageKey));
  }, [autoRefreshPageKey, canAutoRefresh, dispatch, tabAutoRefreshEnabled]);
}
