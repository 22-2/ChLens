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
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";
import type { ThreadRefreshController } from "src/view/browser/hooks/use-thread-refresh-controller";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import { getResizeObserverForWindow, isHTMLElementInWindow } from "src/view/browser/utils/dom";
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
  const autoScrollBoundaryRef = useRef<HTMLDivElement>(null);
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
  const canAutoScrollRef = useRef(false);
  const startAtBottomAppliedRef = useRef(false);
  const userInterruptedRef = useRef(false);
  const scrollObserverFrameRef = useRef<number | null>(null);
  const contentResizeObserverFrameRef = useRef<number | null>(null);
  const lastObservedScrollHeightRef = useRef<number | null>(null);
  // 変更理由: サイドタブバー開閉やウィンドウリサイズでは scrollHeight が変わらず
  // clientHeight だけが変わることがある。底面維持の判定に両方を使うため、高さも保持する。
  const lastObservedClientHeightRef = useRef<number | null>(null);
  const scrollingIndicatorTimerRef = useRef<number | null>(null);
  // wheel リスナーから読むための写し。state を依存配列に入れると、インジケータが
  // 切り替わるたびに scroll/wheel リスナーを付け直すことになるため ref で読む。
  const isAutoScrollingRef = useRef(false);
  const [canAutoScroll, setCanAutoScroll] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
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

  const clearScrollingIndicator = useCallback(() => {
    if (scrollingIndicatorTimerRef.current != null) {
      viewWindow.clearTimeout(scrollingIndicatorTimerRef.current);
      scrollingIndicatorTimerRef.current = null;
    }
    isAutoScrollingRef.current = false;
    setIsAutoScrolling(false);
  }, [viewWindow]);

  const showScrollingIndicator = useCallback(() => {
    if (scrollingIndicatorTimerRef.current != null) {
      viewWindow.clearTimeout(scrollingIndicatorTimerRef.current);
      scrollingIndicatorTimerRef.current = null;
    }

    // scrollBy 自体は即時でも、状態表示は少し残した方が
    // 「今まさに追従した」ことをユーザーが認識しやすい。
    isAutoScrollingRef.current = true;
    setIsAutoScrolling(true);
    scrollingIndicatorTimerRef.current = viewWindow.setTimeout(() => {
      scrollingIndicatorTimerRef.current = null;
      isAutoScrollingRef.current = false;
      setIsAutoScrolling(false);
    }, 900);
  }, [viewWindow]);

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

  const getScrollContainer = useCallback((): HTMLElement | null => {
    const host = rootRef.current;
    if (!host) {
      return null;
    }
    const nearestPanel = host.closest(".content-area__tab-panel");
    if (isHTMLElementInWindow(nearestPanel, viewWindow)) {
      return nearestPanel;
    }

    const contentArea = host.closest(".content-area");
    if (!isHTMLElementInWindow(contentArea, viewWindow)) {
      return null;
    }

    const activePanel = contentArea.querySelector(".content-area__tab-panel[data-active='true']");
    if (isHTMLElementInWindow(activePanel, viewWindow)) {
      return activePanel;
    }

    // 互換性のため、旧構成（content-area 自体がスクロール）の場合は fallback する。
    return contentArea;
  }, [rootRef, viewWindow]);

  const moveToThreadBottom = useCallback((): HTMLElement | null => {
    const scrollContainer = getScrollContainer();
    if (!scrollContainer) {
      return null;
    }

    // 自動更新ON直後に途中位置のままだと、初回更新だけは追従せず「開始した感」が薄い。
    // 先に最下部へ寄せてから refresh を投げることで、legacy と同じ感覚に揃える。
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    canAutoScrollRef.current = true;
    setCanAutoScroll(true);
    return scrollContainer;
  }, [getScrollContainer]);

  const syncCanAutoScroll = useCallback(() => {
    const scrollContainer = getScrollContainer();
    const boundary = autoScrollBoundaryRef.current;

    // 非アクティブなパネルの寸法変化を同期すると、表示中の追従状態を
    // hidden なタブのレイアウトで上書きしてしまうため、現在のパネルだけを判定する。
    if (!enabled || !scrollContainer || scrollContainer.dataset.active === "false" || !boundary) {
      canAutoScrollRef.current = false;
      setCanAutoScroll(false);
      lastObservedScrollHeightRef.current = null;
      lastObservedClientHeightRef.current = null;
      return;
    }

    const currentScrollHeight = scrollContainer.scrollHeight;
    const currentClientHeight = scrollContainer.clientHeight;
    const sizeChanged =
      lastObservedScrollHeightRef.current !== currentScrollHeight ||
      lastObservedClientHeightRef.current !== currentClientHeight;
    lastObservedScrollHeightRef.current = currentScrollHeight;
    lastObservedClientHeightRef.current = currentClientHeight;

    // 新着描画やブラウザのスクロール補正が先に境界を動かしても、それを手動離脱と見なさない。
    // 通常更新・ライブチャット・画像読み込み・容器のリサイズを同じ順序で処理し、
    // 変更前の追従意図で底面を補正してから境界を判定する。現在の距離を使うことで、
    // ブラウザが既に補正した分や後続のResizeObserver通知を二重に加算しない。
    if (
      sizeChanged &&
      canAutoScrollRef.current &&
      !userInterruptedRef.current &&
      !pauseAutoScroll
    ) {
      const distanceToBottom =
        Math.max(0, currentScrollHeight - currentClientHeight) - scrollContainer.scrollTop;
      if (distanceToBottom !== 0) {
        scrollContainer.scrollBy({ top: distanceToBottom, behavior: "auto" });
        showScrollingIndicator();
      }
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const boundaryRect = boundary.getBoundingClientRect();
    const viewportBottom = scrollContainer.scrollTop + scrollContainer.clientHeight;
    const boundaryBottom = scrollContainer.scrollTop + boundaryRect.bottom - containerRect.top;
    // scrollHeight/clientHeightは整数だが境界の座標は小数になるため、丸め誤差で追従を外さない。
    const nextValue = viewportBottom + 1 >= boundaryBottom;

    canAutoScrollRef.current = nextValue;
    setCanAutoScroll((prev) => (prev === nextValue ? prev : nextValue));
  }, [enabled, getScrollContainer, pauseAutoScroll, showScrollingIndicator]);

  useLayoutEffect(() => {
    // ライブチャットは通信完了後にも行を追加するため、取得状態によらず描画ごとに補正する。
    syncCanAutoScroll();
  });

  useLayoutEffect(() => {
    if (!startAtBottom) {
      startAtBottomAppliedRef.current = false;
      return;
    }
    if (!enabled || loading || startAtBottomAppliedRef.current) {
      return;
    }

    // 変更理由: 次スレ移動では hook 自体が enabled のまま再マウントされるため、
    // 通常の「OFFからON」検知が働かず canAutoScroll が false のまま残る。
    // 初回取得前では空のスレッドにしか移動できないため、取得完了後に一度だけ
    // 最下部へ寄せ、次の自動更新・次スレ判定を継続させる。
    const scrollContainer = moveToThreadBottom();
    if (!scrollContainer) {
      return;
    }
    startAtBottomAppliedRef.current = true;
    viewWindow.requestAnimationFrame(() => {
      syncCanAutoScroll();
    });
  }, [enabled, loading, moveToThreadBottom, startAtBottom, syncCanAutoScroll, viewWindow]);

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
    const scrollContainer = getScrollContainer();
    if (!scrollContainer) {
      return;
    }

    const scheduleSync = () => {
      if (scrollObserverFrameRef.current != null) {
        return;
      }

      scrollObserverFrameRef.current = viewWindow.requestAnimationFrame(() => {
        scrollObserverFrameRef.current = null;
        syncCanAutoScroll();
      });
    };

    const handleWheel = () => {
      if (pendingRefreshRef.current || isAutoScrollingRef.current || canAutoScrollRef.current) {
        // smooth scroll を使わない代わりに、ユーザー操作が入ったフレームでは
        // 予定していた自動追従を明示的に取り消して手動スクロールを優先する。
        // 高さ変更の監視中も同じ意図を維持し、ユーザーのホイール操作直後に
        // 境界へ引き戻さないようにする。
        userInterruptedRef.current = true;
      }
    };

    scheduleSync();
    scrollContainer.addEventListener("scroll", scheduleSync, { passive: true });
    scrollContainer.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      if (scrollObserverFrameRef.current != null) {
        viewWindow.cancelAnimationFrame(scrollObserverFrameRef.current);
        scrollObserverFrameRef.current = null;
      }

      scrollContainer.removeEventListener("scroll", scheduleSync);
      scrollContainer.removeEventListener("wheel", handleWheel);
    };
  }, [getScrollContainer, syncCanAutoScroll, viewWindow]);

  useEffect(() => {
    const root = rootRef.current;
    const scrollContainer = getScrollContainer();

    if (!enabled || !root || !scrollContainer || scrollContainer.dataset.active === "false") {
      lastObservedScrollHeightRef.current = null;
      lastObservedClientHeightRef.current = null;
      return;
    }

    // ResizeObserver は初回 observe 時にも通知するため、現在値を先に保存して
    // 初回通知を「高さ変更」と誤認しないようにする。
    lastObservedScrollHeightRef.current = scrollContainer.scrollHeight;
    lastObservedClientHeightRef.current = scrollContainer.clientHeight;

    const scheduleContentResize = () => {
      if (contentResizeObserverFrameRef.current != null) {
        return;
      }

      contentResizeObserverFrameRef.current = viewWindow.requestAnimationFrame(() => {
        contentResizeObserverFrameRef.current = null;

        syncCanAutoScroll();
      });
    };

    // 変更理由: サイドタブバー開閉は window リサイズを発火させず、root の幅変化だけが
    // 起きる。scroll 側の window resize だけでは追従維持と競合して判定が外れるため、
    // 同じ補正経路へ一本化し、rAF で合流させて二重判定を防ぐ。
    viewWindow.addEventListener("resize", scheduleContentResize);

    const ResizeObserverConstructor = getResizeObserverForWindow(viewWindow);
    if (ResizeObserverConstructor == null) {
      return () => {
        viewWindow.removeEventListener("resize", scheduleContentResize);
        if (contentResizeObserverFrameRef.current != null) {
          viewWindow.cancelAnimationFrame(contentResizeObserverFrameRef.current);
          contentResizeObserverFrameRef.current = null;
        }
        lastObservedScrollHeightRef.current = null;
        lastObservedClientHeightRef.current = null;
      };
    }

    const resizeObserver = new ResizeObserverConstructor(scheduleContentResize);
    resizeObserver.observe(root);
    // 変更理由: root だけではコンテナ自体の高さ変化（下部パネル開閉やウィンドウ高さ変更で
    // 中身の高さが変わらない場合）を検知できない。スクロールコンテナ自体も監視して
    // サイズ変更全般を同じ底面維持処理へ流す。
    resizeObserver.observe(scrollContainer);

    return () => {
      viewWindow.removeEventListener("resize", scheduleContentResize);
      resizeObserver.disconnect();
      if (contentResizeObserverFrameRef.current != null) {
        viewWindow.cancelAnimationFrame(contentResizeObserverFrameRef.current);
        contentResizeObserverFrameRef.current = null;
      }
      lastObservedScrollHeightRef.current = null;
      lastObservedClientHeightRef.current = null;
    };
  }, [enabled, getScrollContainer, rootRef, syncCanAutoScroll, viewWindow]);

  useEffect(() => {
    return () => {
      if (scrollingIndicatorTimerRef.current != null) {
        viewWindow.clearTimeout(scrollingIndicatorTimerRef.current);
      }
    };
  }, [viewWindow]);

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
