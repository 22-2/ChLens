import { useCallback, useRef } from "react";
import {
  executeTabCommandRequest,
  type TabCommandId,
} from "src/view/browser/commands/tab-command-runtime";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

/**
 * 表示中のタブIDを明示して履歴・再取得コマンドを実行する。
 *
 * 変更理由: タイトルバーやコンテキストメニューが個別にdispatchを組み立てると、
 * 別窓で選択中タブへ誤送信しやすいため、対象IDの付与をフックへ集約する。
 */
export function useTabCommandRunner(tabId: string): (id: TabCommandId) => boolean {
  const tabStore = useTabStore();
  const { dispatch, stateRef, paneId } = tabStore;
  const paneState = tabStore.state;
  const fallbackStateRef = useRef({
    panes: [
      {
        id: paneId,
        tabs: paneState?.tabs ?? [],
        activeTabId: paneState?.selectedTabId ?? tabId,
      },
    ],
    activePaneId: paneId,
    closedTabs: paneState?.closedTabs ?? [],
  });
  fallbackStateRef.current = {
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

  return useCallback(
    (id: TabCommandId) => {
      // 変更理由: 埋め込み先が古いTabStore互換実装でも、現在ペインの状態から
      // 最小限のスナップショットを組み立ててコマンド境界を利用できるようにする。
      const currentState = stateRef?.current ?? fallbackStateRef.current;
      return executeTabCommandRequest({ id, args: { tabId } }, { state: currentState, dispatch });
    },
    [dispatch, fallbackStateRef, stateRef, tabId],
  );
}
