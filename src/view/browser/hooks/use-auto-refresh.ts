import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  MIN_THREAD_AUTO_REFRESH_MS,
  readIdleStopTimeoutValue,
  readThreadAutoRefreshIntervalMs,
  resolveIdleStopTimeoutMs,
  THREAD_AUTO_REFRESH_CONFIG_KEY,
  THREAD_AUTO_REFRESH_IDLE_STOP_COUNT,
} from "src/view/browser/hooks/auto-refresh-config";
import type { ThreadRefreshController } from "src/view/browser/hooks/use-thread-refresh-controller";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import { getResizeObserverForWindow, isHTMLElementInWindow } from "src/view/browser/utils/dom";
import { SCOPED_SETTINGS_CONFIG_KEY } from "src/view/browser/utils/scoped-settings";

interface PendingRefreshSnapshot {
  responseCount: number;
  lastResponseNum: number | null;
  scrollHeight: number;
  shouldScroll: boolean;
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
  deferExpiredStop = false,
}: UseAutoRefreshOptions): UseAutoRefreshResult {
  const { window: viewWindow, document: viewDocument } = useViewSurface();
  const { markInternalRefreshRequest, consumeRefreshKeyChange, consumeRefreshCompletionGate } =
    refreshController;
  const autoScrollBoundaryRef = useRef<HTMLDivElement>(null);
  const pendingRefreshRef = useRef<PendingRefreshSnapshot | null>(null);
  const requestRefreshRef = useRef(requestRefresh);
  const onNewResponsesRef = useRef(onNewResponses);
  const onAutoStopRef = useRef(onAutoStop);
  const onThreadExpiredRef = useRef(onThreadExpired);
  // 同じスレの再取得では expired が一度 false に戻ることがあるため、
  // 自動更新停止と通知は hook の生存中に一度だけ実行する。
  const threadExpiredHandledRef = useRef(false);
  // 新着が来なかった更新が何回連続したか。新着が来たら 0 に戻す。
  const consecutiveIdleRefreshRef = useRef(0);
  // 最後に新着が来た時刻（epoch ms）。時間ベースの自動停止判定に使う。
  const lastNewResponseTimeRef = useRef<number | null>(null);
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
  const [canAutoScroll, setCanAutoScroll] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    viewDocument.visibilityState === "visible",
  );
  const [intervalMs, setIntervalMs] = useState(() => readThreadAutoRefreshIntervalMs(scopeUrl));

  const requestRefreshFromHook = useCallback(() => {
    // タイマー・ON直後の更新はここで先にスナップショットを保存しているため、
    // 後続の refreshKey 変化では同じ更新を二重に記録しない。
    markInternalRefreshRequest();
    requestRefreshRef.current();
  }, [markInternalRefreshRequest]);

  const clearScrollingIndicator = useCallback(() => {
    if (scrollingIndicatorTimerRef.current != null) {
      viewWindow.clearTimeout(scrollingIndicatorTimerRef.current);
      scrollingIndicatorTimerRef.current = null;
    }
    setIsAutoScrolling(false);
  }, [viewWindow]);

  const showScrollingIndicator = useCallback(() => {
    if (scrollingIndicatorTimerRef.current != null) {
      viewWindow.clearTimeout(scrollingIndicatorTimerRef.current);
      scrollingIndicatorTimerRef.current = null;
    }

    // scrollBy 自体は即時でも、状態表示は少し残した方が
    // 「今まさに追従した」ことをユーザーが認識しやすい。
    setIsAutoScrolling(true);
    scrollingIndicatorTimerRef.current = viewWindow.setTimeout(() => {
      scrollingIndicatorTimerRef.current = null;
      setIsAutoScrolling(false);
    }, 900);
  }, [viewWindow]);

  useEffect(() => {
    requestRefreshRef.current = requestRefresh;
  }, [requestRefresh]);

  useLayoutEffect(() => {
    // 新着判定もlayout effectで行うため、同じrenderの最新レス一覧を参照する通知処理を
    // 完了処理より先に差し替える。passive effectでは旧renderのレス一覧を捕まえてしまう。
    onNewResponsesRef.current = onNewResponses;
  }, [onNewResponses]);

  useEffect(() => {
    onAutoStopRef.current = onAutoStop;
  }, [onAutoStop]);

  useEffect(() => {
    onThreadExpiredRef.current = onThreadExpired;
  }, [onThreadExpired]);

  useEffect(() => {
    if (!enabled || !expired || threadExpiredHandledRef.current) {
      return;
    }

    // expired になった時点で保留中の追従を破棄する。通信タイマーは別の effect で
    // 停止したまま、次スレ探索中だけタブ側の停止通知を保留して探索を競合させない。
    pendingRefreshRef.current = null;
    userInterruptedRef.current = false;
    if (deferExpiredStop) {
      return;
    }

    threadExpiredHandledRef.current = true;
    onThreadExpiredRef.current?.();
  }, [deferExpiredStop, enabled, expired]);

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
      return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const boundaryRect = boundary.getBoundingClientRect();
    const viewportBottom = scrollContainer.scrollTop + scrollContainer.clientHeight;
    const boundaryBottom = scrollContainer.scrollTop + boundaryRect.bottom - containerRect.top;
    const nextValue = viewportBottom >= boundaryBottom;

    canAutoScrollRef.current = nextValue;
    setCanAutoScroll((prev) => (prev === nextValue ? prev : nextValue));
  }, [enabled, getScrollContainer]);

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
    // 初回取得前に寄せると空のscrollHeightを記録してしまうため、取得完了後に一度だけ
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
    (
      isIdleStopCandidate: boolean,
      shouldScroll = canAutoScrollRef.current,
      shouldNotify = false,
    ): boolean => {
      const scrollContainer = getScrollContainer();
      if (!scrollContainer) {
        return false;
      }

      const pendingRefresh = pendingRefreshRef.current;
      if (pendingRefresh) {
        // 外部の手動更新が自動更新中に割り込んだ場合は、同じ通信完了を
        // アイドル停止の一回として数えない。ただし、最初に保存した高さと
        // 追従意図は複数の更新をまたいで維持する。
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
        scrollHeight: scrollContainer.scrollHeight,
        shouldScroll,
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
    if (enabled) {
      return;
    }

    // OFF にした瞬間に保留中スクロールまで実行すると「止めたのに動く」感触になるので破棄する。
    pendingRefreshRef.current = null;
    userInterruptedRef.current = false;
    // 次に ON にしたとき前回のアイドル累積を引き継がないようリセットする。
    consecutiveIdleRefreshRef.current = 0;
    clearScrollingIndicator();
  }, [clearScrollingIndicator, enabled]);

  useEffect(() => {
    const wasEnabled = prevEnabledRef.current;
    prevEnabledRef.current = enabled;

    if (wasEnabled || !enabled) {
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
    consecutiveIdleRefreshRef.current = 0;
    capturePendingRefresh(false, true);
    requestRefreshFromHook();
  }, [
    capturePendingRefresh,
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
    // 更新前の高さを失うことがある。描画前の layout effect で確実に保存する。
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
      if (pendingRefreshRef.current || isAutoScrolling || canAutoScrollRef.current) {
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
  }, [getScrollContainer, isAutoScrolling, syncCanAutoScroll, viewWindow]);

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

        const currentRoot = rootRef.current;
        const currentScrollContainer = getScrollContainer();
        if (
          !currentRoot ||
          !currentScrollContainer ||
          currentScrollContainer.dataset.active === "false"
        ) {
          return;
        }

        const currentScrollHeight = currentScrollContainer.scrollHeight;
        const currentClientHeight = currentScrollContainer.clientHeight;
        const previousScrollHeight = lastObservedScrollHeightRef.current;
        const previousClientHeight = lastObservedClientHeightRef.current;
        lastObservedScrollHeightRef.current = currentScrollHeight;
        lastObservedClientHeightRef.current = currentClientHeight;

        const sizeChanged =
          previousScrollHeight == null ||
          previousClientHeight == null ||
          currentScrollHeight !== previousScrollHeight ||
          currentClientHeight !== previousClientHeight;
        if (!sizeChanged) {
          syncCanAutoScroll();
          return;
        }

        // ユーザーが境界から離れていない間だけ底面位置を維持する。
        // これにより NG 解除や画像読み込みでも、明示的な上スクロールを奪わない。
        // 変更理由: サイドタブバー開閉・ウィンドウリサイズ・下部パネル開閉など
        // サイズ変更全般で追従判定が外れないよう、scrollHeight 差分ではなく
        // 現在位置からの底面距離で補正する。コンテナ拡大時のブラウザ自動クランプを
        // 読み直すため、二重補正にならず、既存の ResizeObserver 基盤を使い回せる。
        if (canAutoScrollRef.current && !userInterruptedRef.current && !pauseAutoScroll) {
          const distanceToBottom =
            currentScrollHeight - (currentScrollContainer.scrollTop + currentClientHeight);
          if (distanceToBottom !== 0) {
            currentScrollContainer.scrollBy({
              top: distanceToBottom,
              behavior: "auto",
            });
            // 通信中にキャッシュや画像の高さが先に変わっても、完了時に同じ差分を
            // もう一度 scrollBy しないよう、保留中スナップショットの基準も進める。
            if (pendingRefreshRef.current) {
              pendingRefreshRef.current.scrollHeight = currentScrollHeight;
            }
            showScrollingIndicator();
          } else if (pendingRefreshRef.current) {
            pendingRefreshRef.current.scrollHeight = currentScrollHeight;
          }
        }

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
  }, [
    enabled,
    getScrollContainer,
    pauseAutoScroll,
    rootRef,
    showScrollingIndicator,
    syncCanAutoScroll,
    viewWindow,
  ]);

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
      if (loadingRef.current || pendingRefreshRef.current) {
        return;
      }

      const scrollContainer = getScrollContainer();
      if (!scrollContainer) {
        return;
      }

      capturePendingRefresh(true, undefined, true);

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
    syncCanAutoScroll();

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

    // 新着があった場合は最終新着時刻を更新（時間ベース停止の判定用）
    if (hasNewResponses) {
      lastNewResponseTimeRef.current = Date.now();

      if (pendingRefresh.shouldNotify) {
        // 通知は追従スクロールの可否に依存させず、ユーザーが途中位置でも知らせる。
        const newResponseCount = Math.max(1, responseCount - pendingRefresh.responseCount);
        onNewResponsesRef.current?.(newResponseCount, pendingRefresh.lastResponseNum);
      }
    }

    // 自動停止（アイドル検知）。
    // 設定に応じて tick ベース（従来動作）または時間ベースで判定する。
    if (pendingRefresh.isIdleStopCandidate) {
      const idleStopTimeoutValue = readIdleStopTimeoutValue();
      const timeoutMs = resolveIdleStopTimeoutMs(idleStopTimeoutValue);

      if (timeoutMs === null && idleStopTimeoutValue === "auto") {
        // tick ベース（従来動作）: 連続アイドル回数で判定
        if (hasNewResponses) {
          consecutiveIdleRefreshRef.current = 0;
        } else {
          consecutiveIdleRefreshRef.current += 1;
          if (consecutiveIdleRefreshRef.current >= THREAD_AUTO_REFRESH_IDLE_STOP_COUNT) {
            if (deferAutoStop) {
              // 次スレ探索が終わるまで累積を保持し、解除後の次回更新で通常停止へ戻す。
              consecutiveIdleRefreshRef.current = THREAD_AUTO_REFRESH_IDLE_STOP_COUNT;
            } else {
              consecutiveIdleRefreshRef.current = 0;
              onAutoStopRef.current?.();
              return;
            }
          }
        }
      } else if (timeoutMs !== null) {
        // 時間ベース: 最後の新着から timeoutMs 経過で停止
        if (!hasNewResponses && lastNewResponseTimeRef.current != null) {
          const elapsed = Date.now() - lastNewResponseTimeRef.current;
          if (elapsed >= timeoutMs) {
            if (deferAutoStop) {
              // 保留中に基準時刻を消すと、探索終了後も時間ベース停止へ戻れない。
              return;
            }
            lastNewResponseTimeRef.current = null;
            onAutoStopRef.current?.();
            return;
          }
        }
      }
      // idleStopTimeoutValue === "0"（無効）の場合は何もしない
    }

    if (!hasNewResponses || userInterruptedRef.current) {
      return;
    }

    if (pauseAutoScroll) {
      // ポップアップ操作中はユーザーの文脈を優先し、
      // 自動更新だけ継続して自動スクロールはこの回を破棄する。
      return;
    }

    const scrollContainer = getScrollContainer();
    if (!scrollContainer) {
      return;
    }

    const currentScrollHeight = scrollContainer.scrollHeight;
    const deltaHeight = currentScrollHeight - pendingRefresh.scrollHeight;
    if (!pendingRefresh.shouldScroll || deltaHeight <= 0) {
      if (hasNewResponses) {
        // ResizeObserver が同じレス描画を再度「高さ変更」として処理して
        // scrollBy を二重実行しないよう、ネットワーク更新後の基準値を進める。
        lastObservedScrollHeightRef.current = currentScrollHeight;
        lastObservedClientHeightRef.current = scrollContainer.clientHeight;
      }
      return;
    }

    scrollContainer.scrollBy({ top: deltaHeight, behavior: "auto" });
    lastObservedScrollHeightRef.current = currentScrollHeight;
    lastObservedClientHeightRef.current = scrollContainer.clientHeight;
    showScrollingIndicator();

    viewWindow.requestAnimationFrame(() => {
      syncCanAutoScroll();
    });
  }, [
    enabled,
    expired,
    getScrollContainer,
    lastResponseNum,
    loading,
    pauseAutoScroll,
    responseCount,
    consumeRefreshCompletionGate,
    deferAutoStop,
    showScrollingIndicator,
    syncCanAutoScroll,
    viewWindow,
  ]);

  return {
    autoScrollBoundaryRef,
    canAutoScroll,
    isAutoScrolling,
    intervalMs,
    phase: isAutoScrolling ? "scrolling" : "idle",
  };
}
