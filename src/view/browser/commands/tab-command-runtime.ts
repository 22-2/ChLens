import type { Dispatch } from "react";
import { tabActions } from "src/view/browser/hooks/tab-store-actions";
import type { ScopedTabAction, TabStoreState } from "src/view/browser/hooks/tab-store-types";
import { canGoBack, canGoForward, getCurrentPage, type Tab } from "src/view/browser/types";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";

/** タブの履歴・再取得・ライフサイクル操作を共有するコマンドID。 */
export const TAB_COMMAND_IDS = {
  BACK: "tab.back",
  FORWARD: "tab.forward",
  RELOAD: "tab.reload",
  CLOSE: "tab.close",
  PIN_SET: "tab.pin.set",
} as const;

export type TabCommandId = (typeof TAB_COMMAND_IDS)[keyof typeof TAB_COMMAND_IDS];

export type TabCommandRequest =
  | {
      readonly id: typeof TAB_COMMAND_IDS.PIN_SET;
      readonly args: {
        readonly tabId: string;
        readonly pinned: boolean;
      };
    }
  | {
      readonly id: Exclude<TabCommandId, typeof TAB_COMMAND_IDS.PIN_SET>;
      readonly args: {
        readonly tabId: string;
      };
    };

export interface TabCommandRuntime {
  readonly state: TabStoreState;
  readonly dispatch: Dispatch<ScopedTabAction>;
}

interface TabLocation {
  readonly paneId: string;
  readonly tab: Tab;
  readonly tabCount: number;
}

function findTab(state: TabStoreState, tabId: string): TabLocation | null {
  for (const pane of state.panes) {
    const tab = pane.tabs.find((candidate) => candidate.id === tabId);
    if (tab) {
      return { paneId: pane.id, tab, tabCount: pane.tabs.length };
    }
  }
  return null;
}

function dispatchForTab(
  runtime: TabCommandRuntime,
  location: TabLocation,
  action: ScopedTabAction,
  includePaneId = false,
): void {
  // 変更理由: 別窓のタブを操作する時は選択中タブへの暗黙フォールバックを避け、
  // コマンドが受け取ったIDだけを更新する必要がある。
  runtime.dispatch({
    ...action,
    ...(includePaneId ? { paneId: location.paneId } : {}),
    tabId: location.tab.id,
  });
}

/**
 * タブの履歴・再取得・ライフサイクルコマンドを対象IDへ限定して実行する。
 *
 * 対象タブが閉じた場合や操作できないページの場合は何もdispatchせずfalseを返す。
 * 別の選択タブへフォールバックしないことで、メイン窓と別窓の履歴が混ざるのを防ぐ。
 */
export function executeTabCommandRequest(
  request: TabCommandRequest,
  runtime: TabCommandRuntime,
): boolean {
  const location = findTab(runtime.state, request.args.tabId);
  if (!location) {
    return false;
  }

  switch (request.id) {
    case TAB_COMMAND_IDS.BACK:
      if (!canGoBack(location.tab)) {
        return false;
      }
      dispatchForTab(runtime, location, tabActions.goBack());
      return true;
    case TAB_COMMAND_IDS.FORWARD:
      if (!canGoForward(location.tab)) {
        return false;
      }
      dispatchForTab(runtime, location, tabActions.goForward());
      return true;
    case TAB_COMMAND_IDS.RELOAD:
      if (!isPageRefreshable(getCurrentPage(location.tab))) {
        return false;
      }
      dispatchForTab(runtime, location, tabActions.reload());
      return true;
    case TAB_COMMAND_IDS.CLOSE:
      // 変更理由: reducerは固定タブとペイン最後の1枚を閉じないため、
      // コマンド境界でも同じ条件を検査して無意味なdispatchを発生させない。
      if (location.tab.pinned || location.tabCount <= 1) {
        return false;
      }
      // 変更理由: CLOSE_TABはpaneId内だけを検索するため、別ペインの対象を
      // 選択中ペインへ誤送信しないよう所有ペインも明示する。
      dispatchForTab(runtime, location, tabActions.closeTab(location.tab.id), true);
      return true;
    case TAB_COMMAND_IDS.PIN_SET:
      // 変更理由: 固定状態を「切り替える」ではなく「指定状態にする」ことで、
      // メニューの連打や二重イベントでも意図しない反転を起こさない。
      if (typeof request.args.pinned !== "boolean" || location.tab.pinned === request.args.pinned) {
        return false;
      }
      // TOGGLE_PINもpaneId内だけを更新するため、所有ペインを必ず添付する。
      dispatchForTab(runtime, location, tabActions.togglePin(location.tab.id), true);
      return true;
  }
}
