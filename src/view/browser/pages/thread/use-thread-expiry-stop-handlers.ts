import { useEffect } from "react";
import { recordDebugEvent } from "src/app/debug/debug-log";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import type { Tab } from "src/view/browser/types";

interface UseThreadExpiryStopHandlersOptions {
  tabId: string;
  tab: Tab | undefined;
  /** 現在のスレッドの自動更新キー。自動更新の対象外のページでは null。 */
  autoRefreshPageKey: string | null;
  expired: boolean;
  missingFromSubject: boolean;
  responseCount: number;
  isAutoRefreshEnabled: boolean;
  isCommentOverlayFlowing: boolean;
  /** 自動更新を止めるときに利用者へ通知する理由。 */
  stopMessage: string;
  /** 次スレ移動がONで、探索の終了まで停止を保留するとき true。 */
  canEnterNextThreadWait: boolean;
  handleAutoRefreshStop: (message: string) => void;
  dispatch: ReturnType<typeof useTabStore>["dispatch"];
}

/**
 * dat落ちによる停止の通知・停止記録と、次スレ探索へ入るときの待機を扱う。
 *
 * 次スレ移動がONの停止は、停止記録ではなく待機として残す。
 * 変更理由: 待機をONのまま表すと、探索が始まるまでステータスバーが自動更新中に見えるため。
 */
export function useThreadExpiryStopHandlers({
  tabId,
  tab,
  autoRefreshPageKey,
  expired,
  missingFromSubject,
  responseCount,
  isAutoRefreshEnabled,
  isCommentOverlayFlowing,
  stopMessage,
  canEnterNextThreadWait,
  handleAutoRefreshStop,
  dispatch,
}: UseThreadExpiryStopHandlersOptions): {
  onThreadExpired: () => void;
  onThreadExpiredDetected: () => void;
} {
  const shouldEnterNextThreadWait =
    autoRefreshPageKey != null && isAutoRefreshEnabled && canEnterNextThreadWait;

  useEffect(() => {
    if (autoRefreshPageKey == null || !shouldEnterNextThreadWait) {
      return;
    }
    recordDebugEvent("auto-refresh", "次スレ待機を開始します", {
      tabId,
      pageKey: autoRefreshPageKey,
    });
    dispatch(tabActions.startNextThreadWait(autoRefreshPageKey));
  }, [autoRefreshPageKey, dispatch, shouldEnterNextThreadWait, tabId]);

  return {
    // interval の停止だけではタブに自動更新状態が残るため、dat落ち時も明示的に解除する。
    // 次スレ移動がONならレス数にかかわらず探索期限まで待ち、OFFなら即座に停止する。
    onThreadExpired: () => {
      // 別窓再マウント時の同じ失効通知は繰り返さない。
      if (tab?.autoRefreshStoppedPageKey === autoRefreshPageKey && !tab.autoRefreshEnabled) {
        return;
      }
      handleAutoRefreshStop(stopMessage);
    },
    onThreadExpiredDetected: () => {
      if (autoRefreshPageKey != null && tab?.autoRefreshStoppedPageKey !== autoRefreshPageKey) {
        // 停止記録は通知なしで付き、以後の開始操作を拒否するため、付けた根拠を残す。
        recordDebugEvent("auto-refresh", "スレッドの停止記録を付けます", {
          tabId,
          pageKey: autoRefreshPageKey,
          expired,
          missingFromSubject,
          responseCount,
          isAutoRefreshEnabled,
          isCommentOverlayFlowing,
        });
        dispatch(tabActions.setAutoRefreshStoppedPageKey(autoRefreshPageKey));
      }
    },
  };
}
