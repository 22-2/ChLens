import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import { log } from "src/app/Log";
import { container } from "src/service-container/index";
import type { ScopedTabAction } from "src/view/browser/hooks/use-tab-store";
import type { Page } from "src/view/browser/types";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";
import {
  findNextThreadCandidates,
  type NextThreadMatch,
} from "src/view/browser/utils/next-thread-search";

export type NextThreadSearchStatus = "idle" | "searching" | "ready" | "error";

export interface NextThreadSearchState {
  status: NextThreadSearchStatus;
  sourceThread: Pick<NextThreadMatch["thread"], "title" | "url"> | null;
  candidates: readonly NextThreadMatch[];
  boardMessage: string | null;
  error: string | null;
}

interface UseNextThreadSearchOptions {
  currentPage: Page;
  isActive: boolean;
  keepAutoRefresh: boolean;
  dispatch: Dispatch<ScopedTabAction>;
}

const IDLE_STATE: NextThreadSearchState = {
  status: "idle",
  sourceThread: null,
  candidates: [],
  boardMessage: null,
  error: null,
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "次スレ候補の検索に失敗しました";
}

export function useNextThreadSearch({
  currentPage,
  isActive,
  keepAutoRefresh,
  dispatch,
}: UseNextThreadSearchOptions): {
  state: NextThreadSearchState;
  searchNextThread: () => Promise<void>;
  close: () => void;
  selectCandidate: (candidate: NextThreadMatch) => void;
} {
  const [state, setState] = useState<NextThreadSearchState>(IDLE_STATE);
  const requestIdRef = useRef(0);

  const close = useCallback(() => {
    // 変更理由: ダイアログを閉じた後に遅れて返ったsubject.txtの結果で、
    // 新しい検索状態を上書きしないようリクエスト世代を進める。
    requestIdRef.current += 1;
    setState(IDLE_STATE);
  }, []);

  const searchNextThread = useCallback(async () => {
    if (currentPage.type !== "thread") {
      return;
    }

    const sourceThread = {
      title: currentPage.title,
      url: currentPage.threadUrl,
    };
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState({
      status: "searching",
      sourceThread,
      candidates: [],
      boardMessage: null,
      error: null,
    });

    try {
      const boardUrl = getBoardUrlFromThreadUrl(sourceThread.url);
      const result = await container.board.getThreads(boardUrl);
      if (requestIdRef.current !== requestId) {
        return;
      }

      // 自動追従と同じ積極モードの最低スコアを使い、手動操作では候補を1件に絞らない。
      const candidates = findNextThreadCandidates(result.threads, sourceThread, {
        mode: "aggressive",
      });
      setState({
        status: "ready",
        sourceThread,
        candidates,
        boardMessage: result.threads.length === 0 ? result.message : null,
        error: null,
      });
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      const message = getErrorMessage(error);
      // 手動検索はコマンド以外からも呼べるため、失敗理由をここで記録して追跡可能にする。
      log("error", "手動次スレ検索に失敗しました", {
        error,
        threadUrl: sourceThread.url,
      });
      setState({
        status: "error",
        sourceThread,
        candidates: [],
        boardMessage: null,
        error: message,
      });
      throw error;
    }
  }, [currentPage]);

  useEffect(() => {
    if (state.sourceThread == null) {
      return;
    }
    if (
      isActive &&
      currentPage.type === "thread" &&
      currentPage.threadUrl === state.sourceThread.url
    ) {
      return;
    }

    // ペイン切替やページ遷移後に古い候補を再表示・適用しないよう、表示も検索も破棄する。
    requestIdRef.current += 1;
    setState(IDLE_STATE);
  }, [currentPage, isActive, state.sourceThread]);

  const selectCandidate = useCallback(
    (candidate: NextThreadMatch) => {
      const sourceThread = state.sourceThread;
      if (
        sourceThread == null ||
        currentPage.type !== "thread" ||
        currentPage.threadUrl !== sourceThread.url
      ) {
        close();
        return;
      }

      dispatch({
        type: "FOLLOW_NEXT_THREAD",
        page: {
          type: "thread",
          title: candidate.thread.title,
          threadUrl: candidate.thread.url,
        },
        keepAutoRefresh,
      });
      setState(IDLE_STATE);
    },
    [close, currentPage, dispatch, keepAutoRefresh, state.sourceThread],
  );

  return { state, searchNextThread, close, selectCandidate };
}
