import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import {
  resolvePaneId,
  updateTargetTab,
} from "src/view/browser/state/tabs/tab-store-state-helpers";
import type { ScopedTabActionOf } from "src/view/browser/state/tabs/tab-store-types";
import { type TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { getCurrentPage, type Tab } from "src/view/browser/types";

/** タブごとの自動更新と次スレ待機の状態を更新する reducer。 */

// 停止記録は、自動更新と次スレ待機の両方を終えたことを一緒に表す。
// 変更理由: 停止記録とON表示を同時に更新し、本文だけ止まってステータスバーが回り続ける状態を防ぐ。
function applyAutoRefreshStopRecord(tab: Tab, pageKey: string | null): Tab {
  return {
    ...tab,
    autoRefreshStoppedPageKey: pageKey,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
    nextThreadWaitPageKey: null,
  };
}

export function setAutoRefreshEnabled(
  state: TabStoreState,
  action: ScopedTabActionOf<"SET_AUTO_REFRESH_ENABLED">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  return updateTargetTab(state, paneId, action.tabId, (tab) => {
    const pageKey =
      action.pageKey ?? tab.autoRefreshPageKey ?? getAutoRefreshPageKey(getCurrentPage(tab));
    if (pageKey != null && pageKey === tab.nextThreadWaitPageKey) {
      // 待機中のONは次スレ探索を開き直す操作になるため無視する。
      // 待機中のOFFは待機の取り消しなので、同じスレで再開しないよう停止記録を付ける。
      return action.enabled ? tab : applyAutoRefreshStopRecord(tab, pageKey);
    }
    // dat落ちや探索期限の終了を開始操作で解除すると、同じスレのsubject取得が連発する。
    const enabled =
      action.enabled && (pageKey == null || pageKey !== tab.autoRefreshStoppedPageKey);
    return {
      ...tab,
      autoRefreshEnabled: enabled,
      autoRefreshPageKey: enabled ? pageKey : null,
    };
  });
}

export function setAutoRefreshStoppedPageKey(
  state: TabStoreState,
  action: ScopedTabActionOf<"SET_AUTO_REFRESH_STOPPED_PAGE_KEY">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  return updateTargetTab(state, paneId, action.tabId, (tab) =>
    applyAutoRefreshStopRecord(tab, action.pageKey),
  );
}

export function startNextThreadWait(
  state: TabStoreState,
  action: ScopedTabActionOf<"START_NEXT_THREAD_WAIT">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  return updateTargetTab(state, paneId, action.tabId, (tab) => {
    // 待機へ移せるのは、そのページで自動更新がONの間だけにする。
    // 別ページへ移った後や既にOFFになった後に届いた通知で、待機を作らないため。
    if (!tab.autoRefreshEnabled || tab.autoRefreshPageKey !== action.pageKey) {
      return tab;
    }
    // 変更理由: 待機中もONにすると、ステータスバーが自動更新中と区別できなくなるため、
    // 自動更新のONは外し、次スレ探索に必要な追従状態は呼び出し側で別に維持する。
    return {
      ...tab,
      autoRefreshEnabled: false,
      autoRefreshPageKey: null,
      nextThreadWaitPageKey: action.pageKey,
    };
  });
}
