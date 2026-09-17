import { useEffect, useRef } from "react";
import { isTauriRuntime } from "src/app/platform/runtime";
import {
  type ArchiveReplayMainThreadRequest,
  subscribeArchiveReplayMainThreadRequests,
} from "src/features/comment-overlay/platform";

import { type TabStoreState, useTabDispatch, useTabStore } from "./use-tab-store";

interface MainThreadSyncTarget {
  sessionId: string;
  generation: number;
  paneId: string;
  tabId: string;
}

/**
 * 過去実況窓から通知された現在スレを、Mainの専用ThreadViewタブへ反映する。
 * 変更理由: 再生対象を現在の閲覧タブへ直接上書きすると、実況とは無関係の読書状態を
 * 破壊するため、最初の通知で専用タブを作り、その後は同じタブだけを再利用する。
 */
export function useArchiveReplayMainThreadSync(): void {
  const dispatch = useTabDispatch();
  const { stateRef } = useTabStore();
  const targetRef = useRef<MainThreadSyncTarget | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    const handleRequest = (request: ArchiveReplayMainThreadRequest): void => {
      const previousTarget = targetRef.current;
      if (
        previousTarget?.sessionId === request.sessionId &&
        request.generation <= previousTarget.generation
      ) {
        return;
      }

      const page = {
        type: "thread" as const,
        title: request.title,
        threadUrl: request.threadUrl,
      };
      let target = previousTarget ? findTabById(stateRef.current, previousTarget.tabId) : null;

      if (target) {
        dispatch({
          type: "NAVIGATE_TAB",
          paneId: target.paneId,
          tabId: target.tabId,
          page,
        });
      } else {
        const beforeTabIds = new Set(
          stateRef.current.panes.flatMap((pane) => pane.tabs.map((tab) => tab.id)),
        );
        dispatch({ type: "OPEN_IN_NEW_TAB_FORCE", page });

        // TabStoreのdispatchはstateRefを同期更新するため、追加されたタブを直ちに特定できる。
        const inserted = stateRef.current.panes
          .flatMap((pane) => pane.tabs.map((tab) => ({ pane, tab })))
          .find(({ tab }) => !beforeTabIds.has(tab.id));
        if (!inserted) {
          console.error("[ArchiveReplay] Main同期用ThreadViewタブを作成できませんでした", {
            request,
          });
          return;
        }

        target = { paneId: inserted.pane.id, tabId: inserted.tab.id };
        dispatch({
          type: "SELECT_TAB",
          paneId: target.paneId,
          tabId: target.tabId,
        });
      }

      targetRef.current = {
        sessionId: request.sessionId,
        generation: request.generation,
        paneId: target.paneId,
        tabId: target.tabId,
      };
    };

    void subscribeArchiveReplayMainThreadRequests(handleRequest)
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unsubscribe = cleanup;
      })
      .catch((error: unknown) => {
        console.error("[ArchiveReplay] MainのThreadView同期購読に失敗しました", error);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [dispatch, stateRef]);
}

function findTabById(
  state: TabStoreState,
  tabId: string,
): { paneId: string; tabId: string } | null {
  // タブを別ペインへ移動しても、同じ実況専用タブを再利用できるよう全ペインから探す。
  const pane = state.panes.find((candidate) => candidate.tabs.some((tab) => tab.id === tabId));
  return pane ? { paneId: pane.id, tabId } : null;
}
