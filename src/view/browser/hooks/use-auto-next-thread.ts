import { useEffect, useRef, useState } from "react";
import { log } from "src/app/Log";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";
import {
  findMainstreamThreadMatch,
  findNextThreadMatch,
  type AutoNextThreadMode,
} from "src/view/browser/utils/next-thread-search";

const NEXT_THREAD_SEARCH_DURATION_MS = 180_000;
const NEXT_THREAD_SEARCH_RETRY_MS = 3_000;
const MAINSTREAM_WATCH_GRACE_PERIOD_MS = 15_000;
const MAINSTREAM_WATCH_DURATION_MS = 60_000;
const MAINSTREAM_WATCH_RETRY_MS = 5_000;
const NEXT_THREAD_TRIGGER_RES_COUNT = 1000;
const REQUIRED_CANDIDATE_CONFIRMATIONS: Record<AutoNextThreadMode, number> = {
  cautious: 3,
  balanced: 2,
  aggressive: 1,
};

type AutoNextThreadStatus = "idle" | "searching" | "watching";

interface UseAutoNextThreadOptions {
  autoRefreshEnabled: boolean;
  featureEnabled: boolean;
  threadUrl: string;
  threadTitle: string;
  responseCount: number;
  expired: boolean;
  mode: AutoNextThreadMode;
  responseMessages: readonly string[];
  /**
   * 自動スクロール閾値より下に居るかどうか。
   * 上の方を読んでいる最中に勝手に次スレへ飛ばすとユーザーの文脈を壊すので、
   * 閾値より下(=追従可能位置)に居るときだけ次スレ移動を行う。
   */
  canAutoScroll: boolean;
  followThread: (thread: Pick<IThread, "title" | "url">) => void;
}

interface MainstreamWatchState {
  boardUrl: string;
  originalThreadUrl: string;
  originalThreadTitle: string;
  currentThreadUrl: string;
  startedAt: number;
}

export function useAutoNextThread({
  autoRefreshEnabled,
  featureEnabled,
  threadUrl,
  threadTitle,
  responseCount,
  expired,
  mode,
  responseMessages,
  canAutoScroll,
  followThread,
}: UseAutoNextThreadOptions): { status: AutoNextThreadStatus } {
  const [status, setStatus] = useState<AutoNextThreadStatus>("idle");
  const [watchState, setWatchState] = useState<MainstreamWatchState | null>(null);
  const lastSearchKeyRef = useRef<string | null>(null);
  const pendingCandidateRef = useRef<{ url: string; count: number } | null>(null);
  const responseMessagesRef = useRef(responseMessages);
  const followThreadRef = useRef(followThread);
  // ブラウザのタブ/ウィンドウを裏に回している間は、ユーザーが見ていないところで
  // 勝手にタブを次スレへ差し替えてしまわないよう、可視状態でのみ動かす。
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );

  useEffect(() => {
    followThreadRef.current = followThread;
  }, [followThread]);

  useEffect(() => {
    responseMessagesRef.current = responseMessages;
  }, [responseMessages]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    lastSearchKeyRef.current = null;
    pendingCandidateRef.current = null;
    setStatus((prev) => (prev === "searching" ? "idle" : prev));
  }, [mode, threadUrl]);

  useEffect(() => {
    if (autoRefreshEnabled && featureEnabled) {
      return;
    }

    lastSearchKeyRef.current = null;
    pendingCandidateRef.current = null;
    setWatchState(null);
    setStatus("idle");
  }, [autoRefreshEnabled, featureEnabled]);

  useEffect(() => {
    if (watchState == null) {
      return;
    }
    if (threadUrl === watchState.originalThreadUrl || threadUrl === watchState.currentThreadUrl) {
      return;
    }

    setWatchState(null);
    setStatus("idle");
  }, [threadUrl, watchState]);

  useEffect(() => {
    if (!autoRefreshEnabled || !featureEnabled || !isDocumentVisible || !canAutoScroll) {
      return;
    }
    if (!expired && responseCount < NEXT_THREAD_TRIGGER_RES_COUNT) {
      return;
    }

    const searchKey = `${threadUrl}:${expired ? "expired" : "full"}`;
    if (lastSearchKeyRef.current === searchKey) {
      return;
    }
    lastSearchKeyRef.current = searchKey;

    let cancelled = false;
    let timerId: number | null = null;

    setWatchState(null);
    setStatus("searching");

    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        timerId = window.setTimeout(() => {
          timerId = null;
          resolve();
        }, ms);
      });

    const searchNextThread = async () => {
      // oxlint-disable-next-line no-useless-assignment
      let boardUrl = "";
      try {
        boardUrl = getBoardUrlFromThreadUrl(threadUrl);
      } catch (error) {
        log("error", "自動次スレ検索で板URLを解決できませんでした", {
          error,
          threadUrl,
        });
        setStatus("idle");
        return;
      }

      const deadline = Date.now() + NEXT_THREAD_SEARCH_DURATION_MS;

      // 1000到達直後はまだ次スレが立っていないことが多いため、
      // 単発検索ではなく短いポーリングで追ってから同じタブを次スレへ進める。
      while (!cancelled && Date.now() < deadline) {
        try {
          const result = await container.board.getThreads(boardUrl);
          const match = findNextThreadMatch(
            result.threads,
            {
              title: threadTitle,
              url: threadUrl,
            },
            {
              mode,
              responseMessages: responseMessagesRef.current,
            },
          );

          if (match) {
            const previousPending = pendingCandidateRef.current;
            const confirmationCount =
              previousPending?.url === match.thread.url ? previousPending.count + 1 : 1;
            pendingCandidateRef.current = {
              url: match.thread.url,
              count: confirmationCount,
            };
            const requiredConfirmations = match.reasons?.includes("explicit-link")
              ? 1
              : REQUIRED_CANDIDATE_CONFIRMATIONS[mode];

            if (confirmationCount >= requiredConfirmations) {
              followThreadRef.current(match.thread);
              container.toast.info(`次スレへ移動しました: ${match.thread.title}`);
              // 変更理由: 慎重モードでは、一度移動した後に勢いだけを根拠として
              // 別候補へ再移動すると「誤移動を避ける」という設定意図に反する。
              if (mode === "cautious") {
                setWatchState(null);
                setStatus("idle");
              } else {
                setWatchState({
                  boardUrl,
                  originalThreadUrl: threadUrl,
                  originalThreadTitle: threadTitle,
                  currentThreadUrl: match.thread.url,
                  startedAt: Date.now(),
                });
                setStatus("watching");
              }
              return;
            }
          } else {
            pendingCandidateRef.current = null;
          }
        } catch (error) {
          // subject.txtが揺れても探索自体は継続するが、原因を追えるよう詳細を残す。
          log("error", "自動次スレ検索の板一覧取得に失敗しました", {
            boardUrl,
            error,
            threadUrl,
          });
        }

        await delay(NEXT_THREAD_SEARCH_RETRY_MS);
      }

      if (!cancelled) {
        setStatus("idle");
      }
    };

    void searchNextThread();

    return () => {
      cancelled = true;
      // 変更理由: 検索中にタブが非表示になったり読書位置がしきい線より上へ
      // 移動した場合、再開後に同じ満了スレをもう一度探索できるようにする。
      if (lastSearchKeyRef.current === searchKey) {
        lastSearchKeyRef.current = null;
      }
      if (timerId != null) {
        window.clearTimeout(timerId);
      }
    };
  }, [
    autoRefreshEnabled,
    canAutoScroll,
    expired,
    featureEnabled,
    isDocumentVisible,
    mode,
    responseCount,
    threadTitle,
    threadUrl,
  ]);

  useEffect(() => {
    if (
      watchState == null ||
      !autoRefreshEnabled ||
      !featureEnabled ||
      !isDocumentVisible ||
      !canAutoScroll ||
      threadUrl !== watchState.currentThreadUrl
    ) {
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;

    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        timerId = window.setTimeout(() => {
          timerId = null;
          resolve();
        }, ms);
      });

    const watchMainstreamThread = async () => {
      const deadline =
        watchState.startedAt + MAINSTREAM_WATCH_GRACE_PERIOD_MS + MAINSTREAM_WATCH_DURATION_MS;

      while (!cancelled && Date.now() < deadline) {
        const now = Date.now();
        if (now < watchState.startedAt + MAINSTREAM_WATCH_GRACE_PERIOD_MS) {
          await delay(MAINSTREAM_WATCH_RETRY_MS);
          continue;
        }

        try {
          const result = await container.board.getThreads(watchState.boardUrl);
          const match = findMainstreamThreadMatch(result.threads, {
            originalThreadUrl: watchState.originalThreadUrl,
            originalThreadTitle: watchState.originalThreadTitle,
            currentThreadUrl: threadUrl,
            mode,
            now,
          });

          if (match) {
            followThreadRef.current(match.thread);
            container.toast.info(`本流スレへ移動しました: ${match.thread.title}`);
            setWatchState(null);
            setStatus("idle");
            return;
          }
        } catch (error) {
          // 本流監視は補助機能なので再試行しつつ、原因を追えるよう詳細を残す。
          log("error", "自動次スレ検索の本流監視に失敗しました", {
            boardUrl: watchState.boardUrl,
            error,
            threadUrl,
          });
        }

        await delay(MAINSTREAM_WATCH_RETRY_MS);
      }

      if (!cancelled) {
        setWatchState(null);
        setStatus("idle");
      }
    };

    void watchMainstreamThread();

    return () => {
      cancelled = true;
      if (timerId != null) {
        window.clearTimeout(timerId);
      }
    };
  }, [
    autoRefreshEnabled,
    canAutoScroll,
    featureEnabled,
    isDocumentVisible,
    mode,
    threadUrl,
    watchState,
  ]);

  return { status };
}
