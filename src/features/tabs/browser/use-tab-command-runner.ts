import { useCallback, useLayoutEffect, useRef } from "react";
import {
  executeTabCommandRequest,
  TAB_COMMAND_IDS,
  type TabCommandId,
} from "src/view/browser/commands/tab-command-runtime";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";

export interface TabCommandRunnerOptions {
  /** 一覧から任意のタブを操作する時だけ指定する。 */
  readonly tabId?: string;
  /** 固定状態を設定するコマンドの目標値。 */
  readonly pinned?: boolean;
  /** 移動コマンドの移動先。 */
  readonly destination?: { readonly windowId: string; readonly paneId: string };
}

/**
 * 表示中のタブIDを明示して履歴・再取得・ライフサイクルコマンドを実行する。
 *
 * 変更理由: タイトルバーやコンテキストメニューが個別にdispatchを組み立てると、
 * 別窓で選択中タブへ誤送信しやすいため、対象IDの付与をフックへ集約する。
 */
export function useTabCommandRunner(
  tabId: string,
): (id: TabCommandId, options?: TabCommandRunnerOptions) => boolean {
  const tabStore = useTabStore();
  const { dispatch, stateRef, paneId } = tabStore;
  const paneState = tabStore.state;
  // 変更理由: callback の依存を増やさないよう、描画ごとの値は最新値の ref に入れて読む。
  const fallbackState = {
    panes: [
      {
        id: paneId,
        tabs: paneState?.tabs ?? [],
        activeTabId: paneState?.selectedTabId ?? tabId,
      },
    ],
    activePaneId: paneId,
    closedTabs: paneState?.closedTabs ?? [],
  };
  const fallbackStateRef = useRef(fallbackState);
  // 値は描画ごとに作り直されるため、依存配列は置かず毎回同期する。
  useLayoutEffect(() => {
    fallbackStateRef.current = fallbackState;
  });

  return useCallback(
    (id: TabCommandId, options?: TabCommandRunnerOptions) => {
      // 変更理由: 埋め込み先が古いTabStore互換実装でも、現在ペインの状態から
      // 最小限のスナップショットを組み立ててコマンド境界を利用できるようにする。
      const currentState = stateRef?.current ?? fallbackStateRef.current;
      const targetTabId = options?.tabId ?? tabId;
      if (id === TAB_COMMAND_IDS.PIN_SET) {
        // 変更理由: 固定状態を省略した呼び出しを型だけでなく実行時にも拒否し、
        // 意図しない反転を発生させない。
        if (options?.pinned === undefined) {
          return false;
        }
        return executeTabCommandRequest(
          { id, args: { tabId: targetTabId, pinned: options.pinned } },
          { state: currentState, dispatch },
        );
      }
      if (id === TAB_COMMAND_IDS.MOVE) {
        if (!options?.destination) {
          return false;
        }
        return executeTabCommandRequest(
          { id, args: { tabId: targetTabId, ...options.destination } },
          { state: currentState, dispatch },
        );
      }
      return executeTabCommandRequest(
        { id, args: { tabId: targetTabId } },
        { state: currentState, dispatch },
      );
    },
    [dispatch, fallbackStateRef, stateRef, tabId],
  );
}
