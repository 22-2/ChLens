import { useEffect, useRef, useState } from "react";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";
import {
  findMainstreamThreadMatch,
  findNextThreadMatch,
} from "src/view/browser/utils/next-thread-search";

const NEXT_THREAD_SEARCH_DURATION_MS = 180_000;
const NEXT_THREAD_SEARCH_RETRY_MS = 3_000;
const MAINSTREAM_WATCH_GRACE_PERIOD_MS = 15_000;
const MAINSTREAM_WATCH_DURATION_MS = 60_000;
const MAINSTREAM_WATCH_RETRY_MS = 5_000;
const NEXT_THREAD_TRIGGER_RES_COUNT = 1000;

type AutoNextThreadStatus = "idle" | "searching" | "watching";

interface UseAutoNextThreadOptions {
  autoRefreshEnabled: boolean;
  featureEnabled: boolean;
  threadUrl: string;
  threadTitle: string;
  responseCount: number;
  expired: boolean;
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
  followThread,
}: UseAutoNextThreadOptions): { status: AutoNextThreadStatus } {
  const [status, setStatus] = useState<AutoNextThreadStatus>("idle");
  const [watchState, setWatchState] = useState<MainstreamWatchState | null>(
    null,
  );
  const lastSearchKeyRef = useRef<string | null>(null);
  const followThreadRef = useRef(followThread);

  useEffect(() => {
    followThreadRef.current = followThread;
  }, [followThread]);

  useEffect(() => {
    lastSearchKeyRef.current = null;
    setStatus((prev) => (prev === "searching" ? "idle" : prev));
  }, [threadUrl]);

  useEffect(() => {
    if (autoRefreshEnabled && featureEnabled) {
      return;
    }

    lastSearchKeyRef.current = null;
    setWatchState(null);
    setStatus("idle");
  }, [autoRefreshEnabled, featureEnabled]);

  useEffect(() => {
    if (watchState == null) {
      return;
    }
    if (
      threadUrl === watchState.originalThreadUrl ||
      threadUrl === watchState.currentThreadUrl
    ) {
      return;
    }

    setWatchState(null);
    setStatus("idle");
  }, [threadUrl, watchState]);

  useEffect(() => {
    if (!autoRefreshEnabled || !featureEnabled) {
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
      let boardUrl = "";
      try {
        boardUrl = getBoardUrlFromThreadUrl(threadUrl);
      } catch {
        setStatus("idle");
        return;
      }

      const deadline = Date.now() + NEXT_THREAD_SEARCH_DURATION_MS;

      // 1000到達直後はまだ次スレが立っていないことが多いため、
      // 単発検索ではなく短いポーリングで追ってから同じタブを次スレへ進める。
      while (!cancelled && Date.now() < deadline) {
        try {
          const result = await container.board.getThreads(boardUrl);
          const match = findNextThreadMatch(result.threads, {
            title: threadTitle,
            url: threadUrl,
          });

          if (match) {
            followThreadRef.current(match.thread);
            container.toast.info(`次スレへ移動しました: ${match.thread.title}`);
            setWatchState({
              boardUrl,
              originalThreadUrl: threadUrl,
              originalThreadTitle: threadTitle,
              currentThreadUrl: match.thread.url,
              startedAt: Date.now(),
            });
            setStatus("watching");
            return;
          }
        } catch {
          // subject.txtが揺れても探索自体は継続したいので、ここでは停止しない。
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
      if (timerId != null) {
        window.clearTimeout(timerId);
      }
    };
  }, [
    autoRefreshEnabled,
    expired,
    featureEnabled,
    responseCount,
    threadTitle,
    threadUrl,
  ]);

  useEffect(() => {
    if (
      watchState == null ||
      !autoRefreshEnabled ||
      !featureEnabled ||
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
        watchState.startedAt +
        MAINSTREAM_WATCH_GRACE_PERIOD_MS +
        MAINSTREAM_WATCH_DURATION_MS;

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
            now,
          });

          if (match) {
            followThreadRef.current(match.thread);
            container.toast.info(
              `本流スレへ移動しました: ${match.thread.title}`,
            );
            setWatchState(null);
            setStatus("idle");
            return;
          }
        } catch {
          // 本流監視は補助機能なので、失敗しても一定時間までは静かに再試行する。
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
  }, [autoRefreshEnabled, featureEnabled, threadUrl, watchState]);

  return { status };
}
