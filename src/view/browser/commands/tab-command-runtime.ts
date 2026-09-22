import type { Dispatch } from "react";
import { tabActions } from "src/view/browser/hooks/tab-store-actions";
import type { ScopedTabAction, TabStoreState } from "src/view/browser/hooks/tab-store-types";
import { canGoBack, canGoForward, getCurrentPage, type Tab } from "src/view/browser/types";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";

/** タブの履歴・再取得操作を共有するコマンドID。 */
export const TAB_COMMAND_IDS = {
  BACK: "tab.back",
  FORWARD: "tab.forward",
  RELOAD: "tab.reload",
} as const;

export type TabCommandId = (typeof TAB_COMMAND_IDS)[keyof typeof TAB_COMMAND_IDS];

export interface TabCommandRequest {
  readonly id: TabCommandId;
  readonly args: {
    readonly tabId: string;
  };
}

export interface TabCommandRuntime {
  readonly state: TabStoreState;
  readonly dispatch: Dispatch<ScopedTabAction>;
}

function findTab(state: TabStoreState, tabId: string): Tab | null {
  for (const pane of state.panes) {
    const tab = pane.tabs.find((candidate) => candidate.id === tabId);
    if (tab) {
      return tab;
    }
  }
  return null;
}

function dispatchForTab(runtime: TabCommandRuntime, tabId: string, action: ScopedTabAction): void {
  // 変更理由: 別窓のタブを操作する時は選択中タブへの暗黙フォールバックを避け、
  // コマンドが受け取ったIDだけを更新する必要がある。
  runtime.dispatch({ ...action, tabId });
}

/**
 * タブの履歴・再取得コマンドを対象IDへ限定して実行する。
 *
 * 対象タブが閉じた場合や操作できないページの場合は何もdispatchせずfalseを返す。
 * 別の選択タブへフォールバックしないことで、メイン窓と別窓の履歴が混ざるのを防ぐ。
 */
export function executeTabCommandRequest(
  request: TabCommandRequest,
  runtime: TabCommandRuntime,
): boolean {
  const tab = findTab(runtime.state, request.args.tabId);
  if (!tab) {
    return false;
  }

  switch (request.id) {
    case TAB_COMMAND_IDS.BACK:
      if (!canGoBack(tab)) {
        return false;
      }
      dispatchForTab(runtime, tab.id, tabActions.goBack());
      return true;
    case TAB_COMMAND_IDS.FORWARD:
      if (!canGoForward(tab)) {
        return false;
      }
      dispatchForTab(runtime, tab.id, tabActions.goForward());
      return true;
    case TAB_COMMAND_IDS.RELOAD:
      if (!isPageRefreshable(getCurrentPage(tab))) {
        return false;
      }
      dispatchForTab(runtime, tab.id, tabActions.reload());
      return true;
  }
}
