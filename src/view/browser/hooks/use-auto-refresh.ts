import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  MIN_THREAD_AUTO_REFRESH_MS,
  readIdleStopTimeoutValue,
  readThreadAutoRefreshIntervalMs,
  THREAD_AUTO_REFRESH_CONFIG_KEY,
} from "src/view/browser/hooks/auto-refresh-config";
import {
  evaluateIdleStop,
  type IdleStopState,
  INITIAL_IDLE_STOP_STATE,
  resolveIdleStopMode,
} from "src/view/browser/hooks/auto-refresh-idle-stop";
import { useAutoFollowScroll } from "src/view/browser/hooks/use-auto-follow-scroll";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";
import type { ThreadRefreshController } from "src/view/browser/hooks/use-thread-refresh-controller";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import { SCOPED_SETTINGS_CONFIG_KEY } from "src/view/browser/utils/scoped-settings";

interface PendingRefreshSnapshot {
  responseCount: number;
  lastResponseNum: number | null;
  // タイマー起点の更新だけ通知対象にし、初回取得や手動更新では通知しない。
  shouldNotify: boolean;
  // 自動停止のアイドル判定に数えてよい更新かどうか。
  // ON直後の初回更新は「新着ゼロ」でも放置とは見なさないので false にする。
  isIdleStopCandidate: boolean;
}

type AutoRefreshPhase = "idle" | "scrolling";

interface UseAutoRefreshOptions {
  enabled: boolean;
  /** 自動更新間隔のサイト・板スコープを決めるURL。 */
  scopeUrl?: string;
  /** 自動更新が有効なまま新しいスレッドを表示するとき、最初に最下部へ同期する。 */
  startAtBottom?: boolean;
  expired: boolean;
  loading: boolean;
  refreshController: ThreadRefreshController;
  pauseAutoScroll: boolean;
  responseCount: number;
  lastResponseNum: number | null;
  rootRef: RefObject<HTMLDivElement | null>;
  requestRefresh: () => void;
  /** 自動更新で新着レスを検知したときに、更新前の末尾レス番号とともに呼ぶ。 */
  onNewResponses?: (count: number, previousLastResponseNum: number | null) => void;
  /** 新着が一定回数(=間隔×N)来ず放置と判断したとき、自動更新を止めるために呼ぶ。 */
  onAutoStop?: () => void;
  /** 次スレ探索中は、候補が見つかるまでタブ側の自動更新解除を保留する。 */
  deferAutoStop?: boolean;
  /** dat落ちを検知して自動更新を止めるとき、一度だけ呼ぶ。 */
  onThreadExpired?: () => void;
  /** dat落ち確定をページの再マウント後も保つ停止キーを記録するときに呼ぶ。 */
  onThreadExpiredDetected?: () => void;
  /** 次スレ探索中は、候補が見つかるまで dat 落ちによる解除通知を保留する。 */
  deferExpiredStop?: boolean;
}

export interface UseAutoRefreshResult {
  autoScrollBoundaryRef: RefObject<HTMLDivElement | null>;
  canAutoScroll: boolean;
  isAutoScrolling: boolean;
  intervalMs: number;
  phase: AutoRefreshPhase;
}

export function useAutoRefresh({
  enabled,
  scopeUrl,
  startAtBottom = false,
  expired,
  loading,
  refreshController,
  pauseAutoScroll,
  responseCount,
  lastResponseNum,
  rootRef,
  requestRefresh,
  onNewResponses,
  onAutoStop,
  deferAutoStop = false,
  onThreadExpired,
  onThreadExpiredDetected,
  deferExpiredStop = false,
}: UseAutoRefreshOptions): UseAutoRefreshResult {
  const { window: viewWindow, document: viewDocument } = useViewSurface();
  const { markInternalRefreshRequest, consumeRefreshKeyChange, consumeRefreshCompletionGate } =
    refreshController;
  const pendingRefreshRef = useRef<PendingRefreshSnapshot | null>(null);
  // 完了判定は layout effect で行うため、同じ render の最新レス一覧を参照する通知処理を
  // 完了処理より先に差し替える。passive effect では旧 render のレス一覧を捕まえてしまう。
  const requestRefreshRef = useLatestRef(requestRefresh);
  const onNewResponsesRef = useLatestRef(onNewResponses);
  const onAutoStopRef = useLatestRef(onAutoStop);
  const onThreadExpiredRef = useLatestRef(onThreadExpired);
  const onThreadExpiredDetectedRef = useLatestRef(onThreadExpiredDetected);
  // 同じスレの再取得では expired が一度 false に戻ることがあるため、
  // 自動更新停止と通知は hook の生存中に一度だけ実行する。
  const threadExpiredHandledRef = useRef(false);
  const threadExpiredRecordedRef = useRef(false);
  const expiryScopeUrlRef = useRef(scopeUrl);
  // 変更理由: intervalのcleanup前に予約済みcallbackが届いても、最新の停止条件で拒否する。
  const enabledRef = useRef(enabled);
  const expiredRef = useRef(expired);
  enabledRef.current = enabled;
  expiredRef.current = expired;
  if (expiryScopeUrlRef.current !== scopeUrl) {
    expiryScopeUrlRef.current = scopeUrl;
    threadExpiredHandledRef.current = false;
    threadExpiredRecordedRef.current = false;
  }
  // 放置による自動停止の判定状態。遷移は evaluateIdleStop に集約している。
  const idleStopStateRef = useRef<IdleStopState>(INITIAL_IDLE_STOP_STATE);
  const loadingRef = useRef(loading);
  const prevLoadingRef = useRef(loading);
  const prevEnabledRef = useRef(enabled);
  const latestSnapshotRef = useRef({ responseCount, lastResponseNum });
  const userInterruptedRef = useRef(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    viewDocument.visibilityState === "visible",
  );
  const [intervalMs, setIntervalMs] = useState(() => readThreadAutoRefreshIntervalMs(scopeUrl));

  const requestRefreshFromHook = useCallback(() => {
    if (!enabledRef.current || expiredRef.current) {
      return;
    }
    // タイマー・ON直後の更新はここで先にレス件数を保存しているため、
    // 後続の refreshKey 変化では同じ更新を二重に記録しない。
    markInternalRefreshRequest();
    requestRefreshRef.current();
  }, [markInternalRefreshRequest]);

  useLayoutEffect(() => {
    if (!expired) {
      return;
    }

    // 自動更新OFF中も停止理由を記録する。満了後の次スレ探索中は、期限終了時に画面側で記録する。
    if (!deferExpiredStop && !threadExpiredRecordedRef.current) {
      threadExpiredRecordedRef.current = true;
      onThreadExpiredDetectedRef.current?.();
    }

    if (!enabled || threadExpiredHandledRef.current) {
      return;
    }

    // dat落ちになった時点で保留中の追従を破棄し、次スレ探索中だけ設定解除通知を保留する。
    pendingRefreshRef.current = null;
    userInterruptedRef.current = false;
    // Overlay表示中は停止通知先を一時的に外すため、callback未設定では処理済みにしない。
    if (deferExpiredStop || onThreadExpiredRef.current == null) {
      return;
    }

    threadExpiredHandledRef.current = true;
    onThreadExpiredRef.current?.();
  }, [deferExpiredStop, enabled, expired, onThreadExpired]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    latestSnapshotRef.current = { responseCount, lastResponseNum };
  }, [lastResponseNum, responseCount]);

  const hasPendingRefresh = useCallback(() => pendingRefreshRef.current != null, []);
  const {
    autoScrollBoundaryRef,
    canAutoScroll,
    isAutoScrolling,
    getScrollContainer,
    moveToThreadBottom,
    syncCanAutoScroll,
    clearScrollingIndicator,
  } = useAutoFollowScroll({
    enabled,
    loading,
    startAtBottom,
    pauseAutoScroll,
    rootRef,
    hasPendingRefresh,
    userInterruptedRef,
  });

  const capturePendingRefresh = useCallback(
    (isIdleStopCandidate: boolean, shouldNotify = false): boolean => {
      const scrollContainer = getScrollContainer();
      if (!scrollContainer) {
        return false;
      }

      const pendingRefresh = pendingRefreshRef.current;
      if (pendingRefresh) {
        // 外部の手動更新が自動更新中に割り込んだ場合は、同じ通信完了を
        // アイドル停止の一回として数えない。
        if (!isIdleStopCandidate) {
          pendingRefresh.isIdleStopCandidate = false;
        }
        // 自動更新中に手動更新が重なっても、最初のタイマー起点の通知意図は失わない。
        pendingRefresh.shouldNotify ||= shouldNotify;
        userInterruptedRef.current = false;
        return true;
      }

      const currentSnapshot = latestSnapshotRef.current;
      pendingRefreshRef.current = {
        responseCount: currentSnapshot.responseCount,
        lastResponseNum: currentSnapshot.lastResponseNum,
        shouldNotify,
        isIdleStopCandidate,
      };
      userInterruptedRef.current = false;
      return true;
    },
    [getScrollContainer],
  );

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
    const applyInterval = () => {
      setIntervalMs(readThreadAutoRefreshIntervalMs(scopeUrl));
    };
    // 変更理由: 設定画面や別タブでサイト・板設定が変わったときも、
    // 実行中のタイマーを再作成して表示中のスレへ即時反映する。
    return subscribeConfigKeys(
      [THREAD_AUTO_REFRESH_CONFIG_KEY, SCOPED_SETTINGS_CONFIG_KEY],
      applyInterval,
      {
        label: "AutoRefresh",
      },
    );
  }, [scopeUrl]);

  useEffect(() => {
    const wasEnabled = prevEnabledRef.current;
    prevEnabledRef.current = enabled;

    if (!enabled) {
      // OFF にした瞬間に保留中スクロールまで実行すると「止めたのに動く」感触になるので破棄する。
      pendingRefreshRef.current = null;
      userInterruptedRef.current = false;
      // 次に ON にしたとき前回のアイドル累積を引き継がないようリセットする。
      // 変更理由: 以前は回数だけを戻して新着時刻を残していたため、OFF の間の経過時間まで
      // 「新着なし」と数え、再 ON 直後の最初の空振りで時間ベース停止が発火していた。
      idleStopStateRef.current = INITIAL_IDLE_STOP_STATE;
      clearScrollingIndicator();
      return;
    }

    if (wasEnabled) {
      return;
    }

    const scrollContainer = moveToThreadBottom();
    viewWindow.requestAnimationFrame(() => {
      syncCanAutoScroll();
    });

    if (!scrollContainer || expired || loadingRef.current || pendingRefreshRef.current) {
      return;
    }

    // ON 直後の初回更新。アイドル累積は ON のタイミングでリセットし、
    // この回は「新着ゼロ」でも放置とは数えない。
    idleStopStateRef.current = INITIAL_IDLE_STOP_STATE;
    capturePendingRefresh(false);
    requestRefreshFromHook();
  }, [
    capturePendingRefresh,
    clearScrollingIndicator,
    enabled,
    expired,
    moveToThreadBottom,
    requestRefreshFromHook,
    syncCanAutoScroll,
    viewWindow,
  ]);

  useLayoutEffect(() => {
    const refreshKeyChangeSource = consumeRefreshKeyChange();
    if (refreshKeyChangeSource == null || !enabled) {
      return;
    }

    if (refreshKeyChangeSource === "internal") {
      return;
    }

    // RELOAD は loading が true になる前に DOM 更新を予約するため、
    // loading の立ち上がりを待つとキャッシュ通知や別リクエストの完了で
    // 更新前のレス件数を失うことがある。layout effect で確実に保存する。
    syncCanAutoScroll();
    capturePendingRefresh(false);
  }, [capturePendingRefresh, consumeRefreshKeyChange, enabled, syncCanAutoScroll]);

  useEffect(() => {
    // fetchThread() の再試行など refreshKey を経由しない取得のためのフォールバック。
    // 通常の RELOAD は直前の layout effect で先に保存されるので、同じ更新を二重に扱わない。
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;

    if (!enabled || wasLoading || !loading || pendingRefreshRef.current) {
      return;
    }

    // 手動・書き込み起因の更新は放置判定の対象にしない。
    capturePendingRefresh(false);
  }, [capturePendingRefresh, enabled, loading]);

  useEffect(() => {
    if (!enabled || expired || !isDocumentVisible || intervalMs < MIN_THREAD_AUTO_REFRESH_MS) {
      return;
    }

    const timerId = viewWindow.setInterval(() => {
      // clearInterval後に実行待ちのcallbackが残る環境でも、失効後の再取得を始めない。
      if (
        !enabledRef.current ||
        expiredRef.current ||
        loadingRef.current ||
        pendingRefreshRef.current
      ) {
        return;
      }

      const scrollContainer = getScrollContainer();
      if (!scrollContainer) {
        return;
      }

      capturePendingRefresh(true, true);

      // 手動更新と同じ RELOAD 経路を使って forceUpdate を一箇所に寄せる。
      // 取得条件が分岐すると「右クリック更新だけ別挙動」が起きやすいため。
      requestRefreshFromHook();
    }, intervalMs);

    return () => {
      viewWindow.clearInterval(timerId);
    };
  }, [
    capturePendingRefresh,
    enabled,
    expired,
    getScrollContainer,
    intervalMs,
    isDocumentVisible,
    requestRefreshFromHook,
    viewWindow,
  ]);

  useLayoutEffect(() => {
    if (consumeRefreshCompletionGate()) {
      return;
    }

    if (!enabled || loading || expired) {
      if (!enabled || expired) {
        pendingRefreshRef.current = null;
      }
      return;
    }

    const pendingRefresh = pendingRefreshRef.current;
    if (!pendingRefresh) {
      return;
    }

    pendingRefreshRef.current = null;

    const hasNewResponses =
      pendingRefresh.responseCount !== responseCount ||
      pendingRefresh.lastResponseNum !== lastResponseNum;

    if (hasNewResponses && pendingRefresh.shouldNotify) {
      // 通知は追従スクロールの可否に依存させず、ユーザーが途中位置でも知らせる。
      const newResponseCount = Math.max(1, responseCount - pendingRefresh.responseCount);
      onNewResponsesRef.current?.(newResponseCount, pendingRefresh.lastResponseNum);
    }

    const { state, shouldStop } = evaluateIdleStop(idleStopStateRef.current, {
      hasNewResponses,
      isIdleStopCandidate: pendingRefresh.isIdleStopCandidate,
      deferStop: deferAutoStop,
      mode: resolveIdleStopMode(readIdleStopTimeoutValue()),
      now: Date.now(),
    });
    idleStopStateRef.current = state;
    if (shouldStop) {
      onAutoStopRef.current?.();
    }
  }, [
    enabled,
    expired,
    lastResponseNum,
    loading,
    responseCount,
    consumeRefreshCompletionGate,
    deferAutoStop,
  ]);

  return {
    autoScrollBoundaryRef,
    canAutoScroll,
    isAutoScrolling,
    intervalMs,
    phase: isAutoScrolling ? "scrolling" : "idle",
  };
}
