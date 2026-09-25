import { useEffect, useRef, useState } from "react";
import { log } from "src/app/Log";
import { container } from "src/service-container/index";
import type { IThread, IToastService } from "src/service-container/interfaces";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";
import {
  type AutoNextThreadMode,
  findMainstreamThreadMatch,
  findNextThreadMatch,
} from "src/view/browser/utils/next-thread-search";

const NEXT_THREAD_SEARCH_RETRY_MS = 3_000;
const MAINSTREAM_WATCH_GRACE_PERIOD_MS = 15_000;
const MAINSTREAM_WATCH_DURATION_MS = 60_000;
const MAINSTREAM_WATCH_RETRY_MS = 5_000;
export const NEXT_THREAD_TRIGGER_RES_COUNT = 1000;
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
  /** 探索を継続できず終了したとき、自動更新の停止を通知する。 */
  onSearchExhausted?: () => void;
  toast?: Pick<IToastService, "info">;
}

interface MainstreamWatchState {
  boardUrl: string;
  originalThreadUrl: string;
  originalThreadTitle: string;
  currentThreadUrl: string;
  startedAt: number;
}

interface MainstreamSnapshot {
  threads: readonly IThread[];
  observedAt: number;
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
  onSearchExhausted,
  toast = container.toast,
}: UseAutoNextThreadOptions): { status: AutoNextThreadStatus } {
  const { window: viewWindow, document: viewDocument } = useViewSurface();
  const [status, setStatus] = useState<AutoNextThreadStatus>("idle");
  const [watchState, setWatchState] = useState<MainstreamWatchState | null>(null);
  const lastSearchKeyRef = useRef<string | null>(null);
  const pendingCandidateRef = useRef<{ url: string; count: number } | null>(null);
  const mainstreamPendingCandidateRef = useRef<{ url: string; count: number } | null>(null);
  const mainstreamSnapshotRef = useRef<MainstreamSnapshot | null>(null);
  const responseMessagesRef = useRef(responseMessages);
  const followThreadRef = useRef(followThread);
  // ブラウザのタブ/ウィンドウを裏に回している間は、ユーザーが見ていないところで
  // 勝手にタブを次スレへ差し替えてしまわないよう、可視状態でのみ動かす。
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => viewDocument.visibilityState === "visible",
  );

  useEffect(() => {
    followThreadRef.current = followThread;
  }, [followThread]);

  useEffect(() => {
    responseMessagesRef.current = responseMessages;
  }, [responseMessages]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(viewDocument.visibilityState === "visible");
    };

    viewDocument.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      viewDocument.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [viewDocument]);

  useEffect(() => {
    lastSearchKeyRef.current = null;
    pendingCandidateRef.current = null;
    mainstreamPendingCandidateRef.current = null;
    mainstreamSnapshotRef.current = null;
    setStatus((prev) => (prev === "searching" ? "idle" : prev));
  }, [mode, threadUrl]);

  useEffect(() => {
    if (autoRefreshEnabled && featureEnabled) {
      return;
    }

    lastSearchKeyRef.current = null;
    pendingCandidateRef.current = null;
    mainstreamPendingCandidateRef.current = null;
    mainstreamSnapshotRef.current = null;
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

    mainstreamPendingCandidateRef.current = null;
    mainstreamSnapshotRef.current = null;
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
    mainstreamPendingCandidateRef.current = null;
    mainstreamSnapshotRef.current = null;
    setStatus("searching");

    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        timerId = viewWindow.setTimeout(() => {
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
        onSearchExhausted?.();
        return;
      }

      // 1000到達直後はまだ次スレが立っていないことが多いため、
      // 候補が板一覧へ載るまでポーリングし、自動更新を解除せず同じタブを次スレへ進める。
      while (!cancelled) {
        try {
          const result = await container.board.getThreads(boardUrl);
          // 取得中にタブが切り替わったり探索条件が無効になった場合は、
          // 古い subject.txt の結果で別スレへ遷移させない。
          if (cancelled) {
            return;
          }
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
              toast.info(`次スレへ移動しました: ${match.thread.title}`);
              // 変更理由: 慎重モードでは、一度移動した後に勢いだけを根拠として
              // 別候補へ再移動すると「誤移動を避ける」という設定意図に反する。
              if (mode === "cautious") {
                mainstreamPendingCandidateRef.current = null;
                mainstreamSnapshotRef.current = null;
                setWatchState(null);
                setStatus("idle");
              } else {
                mainstreamPendingCandidateRef.current = null;
                mainstreamSnapshotRef.current = null;
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

        if (cancelled) {
          return;
        }
        await delay(NEXT_THREAD_SEARCH_RETRY_MS);
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
        viewWindow.clearTimeout(timerId);
      }
    };
  }, [
    autoRefreshEnabled,
    canAutoScroll,
    expired,
    featureEnabled,
    isDocumentVisible,
    mode,
    onSearchExhausted,
    responseCount,
    threadTitle,
    threadUrl,
    toast,
    viewWindow,
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
        timerId = viewWindow.setTimeout(() => {
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
          // 取得中に次スレ監視が解除された場合は、古い板一覧を使わず終了する。
          if (cancelled) {
            return;
          }
          const previousSnapshot = mainstreamSnapshotRef.current;
          mainstreamSnapshotRef.current = {
            threads: result.threads,
            observedAt: now,
          };

          // 初回取得は基準値として保存し、レス増加量を比較できる次回から判定する。
          if (previousSnapshot == null) {
            await delay(MAINSTREAM_WATCH_RETRY_MS);
            continue;
          }

          const match = findMainstreamThreadMatch(result.threads, {
            originalThreadUrl: watchState.originalThreadUrl,
            originalThreadTitle: watchState.originalThreadTitle,
            currentThreadUrl: threadUrl,
            mode,
            previousThreads: previousSnapshot.threads,
            previousObservedAt: previousSnapshot.observedAt,
            now,
          });

          if (match) {
            const previousPending = mainstreamPendingCandidateRef.current;
            const confirmationCount =
              previousPending?.url === match.thread.url ? previousPending.count + 1 : 1;
            mainstreamPendingCandidateRef.current = {
              url: match.thread.url,
              count: confirmationCount,
            };

            if (confirmationCount >= REQUIRED_CANDIDATE_CONFIRMATIONS[mode]) {
              followThreadRef.current(match.thread);
              toast.info(`本流スレへ移動しました: ${match.thread.title}`);
              mainstreamPendingCandidateRef.current = null;
              mainstreamSnapshotRef.current = null;
              setWatchState(null);
              setStatus("idle");
              return;
            }
          } else {
            mainstreamPendingCandidateRef.current = null;
          }
        } catch (error) {
          // 本流監視は補助機能なので再試行しつつ、原因を追えるよう詳細を残す。
          log("error", "自動次スレ検索の本流監視に失敗しました", {
            boardUrl: watchState.boardUrl,
            error,
            threadUrl,
          });
        }

        if (cancelled) {
          return;
        }
        await delay(MAINSTREAM_WATCH_RETRY_MS);
      }

      if (!cancelled) {
        mainstreamPendingCandidateRef.current = null;
        mainstreamSnapshotRef.current = null;
        setWatchState(null);
        setStatus("idle");
      }
    };

    void watchMainstreamThread();

    return () => {
      cancelled = true;
      if (timerId != null) {
        viewWindow.clearTimeout(timerId);
      }
    };
  }, [
    autoRefreshEnabled,
    canAutoScroll,
    featureEnabled,
    isDocumentVisible,
    mode,
    threadUrl,
    toast,
    viewWindow,
    watchState,
  ]);

  return { status };
}
