import { ArrowDown, ArrowUp, Grip, Pause, Play } from "lucide-react";
import React, {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  manualPauseKey,
  useManualPauseStore,
} from "src/features/auto-refresh/browser/manual-pause-store";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { getResizeObserverForWindow, isHTMLElementInWindow } from "src/view/browser/utils/dom";

interface ThreadScrollFloatingActionsProps {
  rootRef: RefObject<HTMLDivElement | null>;
  isActive: boolean;
  /** 自動更新の開始後は、同じボタンで一時停止と再開を切り替える。 */
  isAutoRefreshEnabled: boolean;
  canAutoRefresh?: boolean;
  isFilterEnabled: boolean;
  loading: boolean;
  expired: boolean;
  responseCount: number;
  onEnableAutoRefresh: () => void;
  tabId: string;
  threadUrl: string;
  isNextThreadWaiting: boolean;
}

interface ScrollFloatingLayout {
  panelLeft: number;
  panelRight: number;
  panelBottom: number;
  panelTop: number;
  minimapReservation: number;
}

function getScrollContainer(
  root: HTMLElement,
  targetWindow: Window = globalThis.window,
): HTMLElement | null {
  const nearestPanel = root.closest(".content-area__tab-panel");
  if (isHTMLElementInWindow(nearestPanel, targetWindow)) {
    return nearestPanel;
  }

  const contentArea = root.closest(".content-area");
  if (!isHTMLElementInWindow(contentArea, targetWindow)) {
    return null;
  }

  const activePanel = contentArea.querySelector(".content-area__tab-panel[data-active='true']");
  return isHTMLElementInWindow(activePanel, targetWindow) ? activePanel : contentArea;
}

function readMinimapReservation(root: HTMLElement, targetWindow: Window): number {
  const rawValue = targetWindow.getComputedStyle(root).getPropertyValue("--thread-minimap-width");
  const reservation = Number.parseFloat(rawValue);
  return Number.isFinite(reservation) ? Math.max(0, reservation) : 0;
}

/** ペインの右下に重なるステータスバーの高さ。操作ボタンはその上に置く。 */
function readStatusBarReservation(root: HTMLElement): number {
  const statusBar = root
    .closest(".pane-column")
    ?.querySelector<HTMLElement>(":scope > .status-bar");
  return statusBar?.getBoundingClientRect().height ?? 0;
}

function isSameLayout(left: ScrollFloatingLayout | null, right: ScrollFloatingLayout): boolean {
  if (!left) {
    return false;
  }

  return (
    left.panelLeft === right.panelLeft &&
    left.panelRight === right.panelRight &&
    left.panelBottom === right.panelBottom &&
    left.panelTop === right.panelTop &&
    left.minimapReservation === right.minimapReservation
  );
}

/**
 * ミニマップに沿う位置へスレッド操作をまとめる。
 *
 * ミニマップはfixed配置でペインごとの矩形を使っているため、
 * この操作もviewport基準の座標へ変換する。これにより2ペイン時も
 * 画面全体ではなく現在のスレペインを基準に移動できる。
 */
export const ThreadScrollFloatingActions: React.FC<ThreadScrollFloatingActionsProps> = ({
  rootRef,
  isActive,
  isAutoRefreshEnabled,
  canAutoRefresh = true,
  isFilterEnabled,
  loading,
  expired,
  responseCount,
  onEnableAutoRefresh,
  tabId,
  threadUrl,
  isNextThreadWaiting,
}) => {
  const { window: viewWindow } = useViewSurface();
  const [layout, setLayout] = useState<ScrollFloatingLayout | null>(null);
  const [position, setPosition] = useState(0.25);
  const [toolbarHeight, setToolbarHeight] = useState(140);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startTop: number } | null>(null);
  const pauseKey = manualPauseKey(tabId, threadUrl);
  const manuallyPaused = useManualPauseStore((state) => !!state.paused[pauseKey]);
  const setPaused = useManualPauseStore((state) => state.setPaused);

  useLayoutEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    const height = element.getBoundingClientRect().height;
    if (height > 0) setToolbarHeight(height);
  }, [layout, canAutoRefresh]);

  useEffect(() => {
    const root = rootRef.current;
    if (!isActive || !root) {
      setLayout(null);
      return;
    }

    const scrollContainer = getScrollContainer(root, viewWindow);
    if (!scrollContainer || scrollContainer.dataset.active === "false") {
      setLayout(null);
      return;
    }

    let frameId: number | null = null;
    const updateLayout = () => {
      frameId = null;
      const currentRoot = rootRef.current;
      const currentScrollContainer = currentRoot
        ? getScrollContainer(currentRoot, viewWindow)
        : null;
      if (
        !currentRoot ||
        !currentScrollContainer ||
        currentScrollContainer.dataset.active === "false"
      ) {
        setLayout(null);
        return;
      }

      const rect = currentScrollContainer.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        setLayout(null);
        return;
      }

      const workspace = currentRoot.closest(".browser-shell__workspace");
      const sidePanel = workspace?.querySelector<HTMLElement>(":scope > .side-panel");
      const sideRect = sidePanel?.getBoundingClientRect();
      // サイドパネルがペインに重なる配置でも、見える右端に操作を配置する。
      const overlapsSidePanel =
        sideRect != null &&
        sideRect.width > 0 &&
        sideRect.left < rect.right &&
        sideRect.right > rect.left &&
        sideRect.top < rect.bottom &&
        sideRect.bottom > rect.top;
      const visibleRight = overlapsSidePanel ? Math.max(rect.left, sideRect.left) : rect.right;

      const nextLayout: ScrollFloatingLayout = {
        panelLeft: rect.left,
        panelRight: visibleRight,
        // 変更理由: ステータスバーは本文の下端に重なるため、操作ボタンの基準はその上端にする。
        panelBottom: rect.bottom - readStatusBarReservation(currentRoot),
        panelTop: Math.max(
          rect.top,
          currentRoot.querySelector(".thread-page__top-bar")?.getBoundingClientRect().bottom ??
            rect.top,
        ),
        // ミニマップ自体がパネルに隠れる部分は二重に避けない。
        minimapReservation: Math.max(
          0,
          visibleRight - (rect.right - readMinimapReservation(currentRoot, viewWindow)),
        ),
      };

      setLayout((previous) => (isSameLayout(previous, nextLayout) ? previous : nextLayout));
    };
    const scheduleLayout = () => {
      if (frameId != null) {
        return;
      }
      // 同期的なrequestAnimationFrame stubでも、callback内で解除した予約状態を
      // 返却後に上書きして以後のスクロール更新を止めないようにする。
      frameId = -1;
      const requestId = viewWindow.requestAnimationFrame(() => {
        frameId = null;
        updateLayout();
      });
      if (frameId != null) {
        frameId = requestId;
      }
    };

    const ResizeObserverConstructor = getResizeObserverForWindow(viewWindow);
    const resizeObserver = ResizeObserverConstructor
      ? new ResizeObserverConstructor(scheduleLayout)
      : null;
    resizeObserver?.observe(scrollContainer);
    resizeObserver?.observe(root);
    const workspace = root.closest(".browser-shell__workspace");
    let observedSidePanel: Element | null = null;
    const observeSidePanel = () => {
      const next = workspace?.querySelector(":scope > .side-panel") ?? null;
      if (observedSidePanel === next) return;
      if (observedSidePanel) resizeObserver?.unobserve(observedSidePanel);
      observedSidePanel = next;
      if (observedSidePanel) resizeObserver?.observe(observedSidePanel);
    };
    observeSidePanel();
    // サイドパネルの追加・削除時にも重なりを再計算する。
    const MutationObserverConstructor = (viewWindow as Window & typeof globalThis).MutationObserver;
    const mutationObserver =
      workspace && MutationObserverConstructor
        ? new MutationObserverConstructor(() => {
            observeSidePanel();
            scheduleLayout();
          })
        : null;
    if (workspace) mutationObserver?.observe(workspace, { childList: true });
    scrollContainer.addEventListener("scroll", scheduleLayout, { passive: true });
    viewWindow.addEventListener("resize", scheduleLayout);
    scheduleLayout();

    return () => {
      if (frameId != null) {
        viewWindow.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      scrollContainer.removeEventListener("scroll", scheduleLayout);
      viewWindow.removeEventListener("resize", scheduleLayout);
    };
  }, [isActive, responseCount, rootRef, viewWindow]);

  const scrollToBottom = useCallback(() => {
    const root = rootRef.current;
    const scrollContainer = root ? getScrollContainer(root, viewWindow) : null;
    if (!scrollContainer) {
      return;
    }

    // スクロール位置を即時に確定させ、既存の自動更新境界判定も同じフレームで追従させる。
    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: "auto" });
  }, [rootRef, viewWindow]);

  const scrollToTop = useCallback(() => {
    const root = rootRef.current;
    const scrollContainer = root ? getScrollContainer(root, viewWindow) : null;
    if (!scrollContainer) {
      return;
    }

    scrollContainer.scrollTo({ top: 0, behavior: "auto" });
  }, [rootRef, viewWindow]);

  if (!layout || layout.panelRight - layout.panelLeft < 48 || !isActive || responseCount === 0) {
    return null;
  }

  const topLimit = layout.panelTop + 8;
  const bottomLimit = Math.max(topLimit, layout.panelBottom - toolbarHeight - 8);
  const top = topLimit + (bottomLimit - topLimit) * position;
  const right = Math.max(layout.panelLeft + 40, layout.panelRight - layout.minimapReservation - 2);
  const moveTo = (nextTop: number) => {
    const range = bottomLimit - topLimit;
    setPosition(range > 0 ? Math.min(1, Math.max(0, (nextTop - topLimit) / range)) : 0);
  };
  const autoLabel = isNextThreadWaiting
    ? "次スレ待機中"
    : !isAutoRefreshEnabled
      ? "自動読み込みを開始"
      : manuallyPaused
        ? "自動更新を再開"
        : "自動更新を一時停止";

  return (
    <div
      ref={toolbarRef}
      className="thread-page__floating-toolbar"
      role="toolbar"
      aria-label="スレッド操作"
      aria-orientation="vertical"
      style={{ left: `${right}px`, top: `${top}px` }}
    >
      <button
        type="button"
        className="thread-page__floating-toolbar-handle"
        aria-label="ツールバーを移動"
        title="ドラッグまたは上下キーで移動"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragRef.current = { startY: event.clientY, startTop: top };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragRef.current)
            moveTo(dragRef.current.startTop + event.clientY - dragRef.current.startY);
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onLostPointerCapture={() => {
          dragRef.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            moveTo(top + (event.key === "ArrowUp" ? -20 : 20));
          }
        }}
      >
        <Grip size={13} aria-hidden="true" />
      </button>
      <button type="button" aria-label="上へジャンプ" title="上へジャンプ" onClick={scrollToTop}>
        <ArrowUp size={15} aria-hidden="true" />
      </button>
      <button type="button" aria-label="下へジャンプ" title="下へジャンプ" onClick={scrollToBottom}>
        <ArrowDown size={15} aria-hidden="true" />
      </button>
      {canAutoRefresh && (
        <>
          <span className="thread-page__floating-toolbar-separator" />
          <button
            type="button"
            aria-label={autoLabel}
            title={autoLabel}
            disabled={
              isNextThreadWaiting ||
              isFilterEnabled ||
              expired ||
              (!isAutoRefreshEnabled && loading)
            }
            aria-pressed={isAutoRefreshEnabled && !manuallyPaused}
            onClick={() =>
              isAutoRefreshEnabled ? setPaused(pauseKey, !manuallyPaused) : onEnableAutoRefresh()
            }
          >
            {isAutoRefreshEnabled && !manuallyPaused ? (
              <Pause size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
          </button>
        </>
      )}
    </div>
  );
};
