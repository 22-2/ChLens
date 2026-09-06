import { DragDropProvider } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";
import {
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTop,
  Pin,
  Plus,
  RotateCcw,
  RotateCw,
  X,
} from "lucide-react";
import normalizeWheel from "normalize-wheel";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { container } from "src/service-container/index";
import { useCursorTooltip } from "src/view/browser/components/CursorTooltip";
import { PageTypeIcon } from "src/view/browser/components/PageTypeIcon";
import { TabContextMenu } from "src/view/browser/components/TabContextMenu";
import { useAutoScrollState } from "src/view/browser/hooks/use-auto-scroll-state";
import {
  TAB_BAR_ORIENTATION_CONFIG_KEY,
  clampTabBarWidth,
  useVerticalTabBarLayout,
  type TabBarOrientation,
} from "src/view/browser/hooks/use-tab-bar-orientation";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { isAutoRefreshEnabledForPage } from "src/view/browser/utils/auto-refresh-pages";

interface ContextMenuState {
  tab: Tab;
  x: number;
  y: number;
}

interface BarContextMenuState {
  x: number;
  y: number;
}

interface TabListScrollState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  canScrollTop: boolean;
  canScrollBottom: boolean;
}

const TAB_SWITCH_WHEEL_DISTANCE_THRESHOLD = 1.5;
const TAB_SWITCH_WHEEL_BASE_COOLDOWN_MS = 150;

// Material Design の Fast-out, Slow-in カーブで Chrome 風の吸い付く感を再現する。
const SORTABLE_TRANSITION = {
  duration: 200,
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
};

interface SortableTabProps {
  tab: Tab;
  index: number;
  isActive: boolean;
  isHighlighted: boolean;
  autoRefreshIndicatorState: "active" | "inactive" | null;
  tabCount: number;
  isVertical: boolean;
  compact: boolean;
  wasDraggingRef: React.MutableRefObject<boolean>;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onContextMenu: (e: React.MouseEvent, tab: Tab) => void;
  onArrowNavigate: (index: number, delta: number) => void;
}

// タブ1枚分の Sortable ラッパー。
// useSortable は各タブが独自に DragDropManager と紐付くため、TabBar 外のコンポーネントとして定義する。
const SortableTab: React.FC<SortableTabProps> = ({
  tab,
  index,
  isActive,
  isHighlighted,
  autoRefreshIndicatorState,
  tabCount,
  isVertical,
  compact,
  wasDraggingRef,
  onSelect,
  onClose,
  onContextMenu,
  onArrowNavigate,
}) => {
  const { ref, isDragSource } = useSortable({
    id: tab.id,
    index,
    // ピン留めタブと通常タブが境界を越えないようにグループで分離する。
    group: tab.pinned ? "pinned" : "normal",
    transition: SORTABLE_TRANSITION,
  });

  const page = getCurrentPage(tab);
  const { show, move, hide, tooltip } = useCursorTooltip();

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 中クリックはドラッグではなく閉じる操作として処理する。
      if (e.button === 1) {
        e.preventDefault();
        hide();
        onClose(tab.id);
      }
    },
    [hide, tab.id, onClose],
  );

  const handleClick = useCallback(() => {
    // ドラッグ終了直後に合成される click でタブが切り替わるのを1回だけ抑止する。
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      hide();
      return;
    }
    hide();
    onSelect(tab.id);
  }, [hide, tab.id, wasDraggingRef, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 変更理由: 垂直モードでは上下、水平モードでは左右でタブ間を移動できるようにし、
      // マウスに頼らないタブ切り替え手段を方向ごとに保つ。
      const nextKey = isVertical ? "ArrowDown" : "ArrowRight";
      const prevKey = isVertical ? "ArrowUp" : "ArrowLeft";
      const delta = e.key === nextKey ? 1 : e.key === prevKey ? -1 : 0;
      if (delta === 0) {
        return;
      }
      e.preventDefault();
      onArrowNavigate(index, delta);
    },
    [index, isVertical, onArrowNavigate],
  );

  return (
    <>
      <div
        ref={ref}
        className={`tab${isActive ? " tab--active" : ""}${
          tab.pinned ? " tab--pinned" : ""
        }${isHighlighted ? " tab--highlighted" : ""}${isDragSource ? " tab--dragging" : ""}`}
        data-tab-id={tab.id}
        role="tab"
        aria-selected={isActive}
        // 変更理由: 簡易表示ではタイトルを隠すため、支援技術向けに名前を補う。
        aria-label={compact && !tab.pinned ? page.title : undefined}
        tabIndex={isActive ? 0 : -1}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onMouseEnter={(event) => show(page.title, event)}
        onMouseMove={(event) => move(page.title, event)}
        onMouseLeave={hide}
        onContextMenu={(e) => {
          hide();
          onContextMenu(e, tab);
        }}
      >
        {tab.pinned ? (
          <Pin size={11} />
        ) : compact ? (
          <span className="tab__icon">
            <PageTypeIcon type={page.type} size={15} />
          </span>
        ) : (
          <span className="tab__title">{page.title}</span>
        )}
        {/* 変更理由: タブが非アクティブでも自動更新設定は残るため、
            実行中/待機中を区別できるインジケーターを常時表示する。 */}
        {autoRefreshIndicatorState != null && !tab.pinned && (
          <span
            className={`tab__auto-refresh-indicator${
              autoRefreshIndicatorState === "inactive"
                ? " tab__auto-refresh-indicator--inactive"
                : ""
            }`}
            title={autoRefreshIndicatorState === "active" ? "自動更新: 動作中" : "自動更新: 待機中"}
            aria-label={
              autoRefreshIndicatorState === "active" ? "自動更新動作中" : "自動更新待機中"
            }
          />
        )}
        {!tab.pinned && tabCount > 1 && (
          <button
            className="tab__close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
            title="タブを閉じる"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {tooltip}
    </>
  );
};

export const TabBar: React.FC<{ orientation?: TabBarOrientation }> = ({
  orientation = "horizontal",
}) => {
  const isVertical = orientation === "vertical";
  const { state, stateRef, dispatch, paneId } = useTabStore();
  const { canAutoScroll, isAutoScrolling, isPaused } = useAutoScrollState();
  const { collapsed, width, setCollapsed, setWidth } = useVerticalTabBarLayout();
  // 変更理由: ドラッグ中は保存済み幅ではなく操作中の幅で描画し、確定時だけ永続化する。
  // 移動のたびに保存すると書き込みが連続して重くなるため。
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragWidthRef = useRef<number | null>(null);
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [barContextMenu, setBarContextMenu] = useState<BarContextMenuState | null>(null);
  const [highlightedTabIds, setHighlightedTabIds] = useState<Set<string>>(new Set());
  const prevTabIdsRef = useRef<Set<string>>(new Set(state.tabs.map((tab) => tab.id)));
  const lastWheelSwitchAtRef = useRef(0);
  // ドラッグ終了直後の click イベントによるタブ選択を抑止するためのフラグ。
  const wasDraggingRef = useRef(false);
  const [tabListScrollState, setTabListScrollState] = useState<TabListScrollState>({
    canScrollLeft: false,
    canScrollRight: false,
    canScrollTop: false,
    canScrollBottom: false,
  });

  const updateTabListScrollState = useCallback(() => {
    const tabList = tabListRef.current;
    if (!tabList) return;

    const maxScrollLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
    const maxScrollTop = Math.max(0, tabList.scrollHeight - tabList.clientHeight);
    const nextState = {
      canScrollLeft: tabList.scrollLeft > 1,
      canScrollRight: tabList.scrollLeft < maxScrollLeft - 1,
      canScrollTop: tabList.scrollTop > 1,
      canScrollBottom: tabList.scrollTop < maxScrollTop - 1,
    };

    setTabListScrollState((previous) =>
      previous.canScrollLeft === nextState.canScrollLeft &&
      previous.canScrollRight === nextState.canScrollRight &&
      previous.canScrollTop === nextState.canScrollTop &&
      previous.canScrollBottom === nextState.canScrollBottom
        ? previous
        : nextState,
    );
  }, []);

  const scrollTabIntoView = useCallback((tabId: string) => {
    const tabElement = [
      ...(tabListRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? []),
    ].find((tab) => tab.dataset.tabId === tabId);
    tabElement?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, []);

  const scrollActiveTabIntoView = useCallback((tabId: string) => {
    const tabList = tabListRef.current;
    const tabElement = [...(tabList?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [])].find(
      (tab) => tab.dataset.tabId === tabId,
    );
    if (!tabList || !tabElement) return;

    const tabListRect = tabList.getBoundingClientRect();
    const tabRect = tabElement.getBoundingClientRect();
    // 変更理由: 垂直モードでは上下の見切れも判定する。水平モードでは縦方向に
    // はみ出さないため、両軸の判定を共通化しても既存の挙動は変わらない。
    const isOutsideViewport =
      tabRect.left < tabListRect.left ||
      tabRect.right > tabListRect.right ||
      tabRect.top < tabListRect.top ||
      tabRect.bottom > tabListRect.bottom;
    if (isOutsideViewport) {
      // 変更理由: 常に scrollIntoView するとタブ切り替えのたびに既存の横位置へ干渉するため、
      // アクティブタブが見切れている場合だけ、最小限のスクロールを発生させる。
      tabElement.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, []);

  const handleTabListResize = useCallback(() => {
    updateTabListScrollState();
    // 変更理由: 表示領域やタブ幅の変化でアクティブタブの矩形が見切れるため、
    // アクティブIDの変更時だけでなく、リサイズ時にも既存の境界判定を再利用する。
    // 見切れている場合だけスクロールするので、手動で決めた横位置を不要に奪わない。
    scrollActiveTabIntoView(state.activeTabId);
  }, [scrollActiveTabIntoView, state.activeTabId, updateTabListScrollState]);

  useEffect(() => {
    const tabList = tabListRef.current;
    if (!tabList) return;

    // スクロール位置の変化だけでなく、ウィンドウ幅とタブ幅の変化も表示へ反映する。
    tabList.addEventListener("scroll", updateTabListScrollState, { passive: true });
    window.addEventListener("resize", handleTabListResize);

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleTabListResize);
      resizeObserver.observe(tabList);
    }

    updateTabListScrollState();

    return () => {
      tabList.removeEventListener("scroll", updateTabListScrollState);
      window.removeEventListener("resize", handleTabListResize);
      resizeObserver?.disconnect();
    };
  }, [handleTabListResize, state.tabs, updateTabListScrollState]);

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  const currentPage = activeTab ? getCurrentPage(activeTab) : null;
  const isTabListScrollable = tabListScrollState.canScrollLeft || tabListScrollState.canScrollRight;
  // 更新は常用操作としてタブバー左端にも置くが、再取得できないページでは無効化する。
  const canRefresh =
    currentPage?.type === "thread" ||
    currentPage?.type === "threadList" ||
    currentPage?.type === "historyList" ||
    currentPage?.type === "writeHistoryList" ||
    currentPage?.type === "logList";

  useEffect(() => {
    const prev = prevTabIdsRef.current;
    const current = new Set(state.tabs.map((tab) => tab.id));
    const newIds = state.tabs.map((tab) => tab.id).filter((tabId) => !prev.has(tabId));

    if (newIds.length > 0) {
      // 変更理由: バックグラウンド追加では activeTabId が変わらないため、
      // 新規タブ自体を基準にスクロールしないと追加位置を利用者が確認できない。
      scrollTabIntoView(newIds[newIds.length - 1]);
      setHighlightedTabIds((prevIds) => {
        const next = new Set(prevIds);
        for (const tabId of newIds) {
          next.add(tabId);
        }
        return next;
      });

      const timerId = window.setTimeout(() => {
        setHighlightedTabIds((prevIds) => {
          const next = new Set(prevIds);
          for (const tabId of newIds) {
            next.delete(tabId);
          }
          return next;
        });
      }, 1500);

      return () => window.clearTimeout(timerId);
    }

    prevTabIdsRef.current = current;
    return;
  }, [scrollTabIntoView, state.tabs]);

  useEffect(() => {
    prevTabIdsRef.current = new Set(state.tabs.map((tab) => tab.id));
  }, [state.tabs]);

  useEffect(() => {
    scrollActiveTabIntoView(state.activeTabId);
  }, [scrollActiveTabIntoView, state.activeTabId]);

  // ホイールでアクティブタブを前後に切り替える
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // 変更理由: 垂直モードのホイールは一覧の縦スクロールに使い、タブ切り替えには使わない。
      // 縦一覧の上で回してスクロールが起きないと予測とずれるため、ここでは何もせず
      // ブラウザの既定スクロールへ任せる。
      if (isVertical) {
        return;
      }
      const normalizedWheel = normalizeWheel(e);
      const wheelDistance = normalizedWheel.pixelX + normalizedWheel.pixelY;
      if (Math.abs(wheelDistance) < TAB_SWITCH_WHEEL_DISTANCE_THRESHOLD) {
        return;
      }

      const now = Date.now();
      const cooldownMs = Math.max(
        0,
        TAB_SWITCH_WHEEL_BASE_COOLDOWN_MS -
          2 * (Math.abs(normalizedWheel.pixelX) + Math.abs(normalizedWheel.pixelY)),
      );
      if (now - lastWheelSwitchAtRef.current < cooldownMs) {
        return;
      }

      // stateRef はグローバル状態を指すので、自ペインを解決してからタブ列を取り出す。
      const pane =
        stateRef.current.panes.find((p) => p.id === paneId) ??
        stateRef.current.panes.find((p) => p.id === stateRef.current.activePaneId);
      if (!pane) return;
      const tabs = pane.tabs;
      const currentIdx = tabs.findIndex((t) => t.id === pane.activeTabId);
      if (currentIdx === -1) return;

      // 変更理由: ブラウザごとの生の delta 符号差を normalize-wheel で吸収し、
      // 正規化後に正なら下/右、負なら上/左として一貫して扱う。
      const delta = wheelDistance > 0 ? 1 : -1;
      const nextIdx = (currentIdx + delta + tabs.length) % tabs.length;

      // 変更理由: タブ列が横にはみ出していても、ホイールによる横スクロールを
      // 優先するとアクティブタブが切り替わらず、タブバーの表示位置だけが変わるため。
      // 切り替え後のアクティブタブは別の effect で必要な場合だけ表示位置へ追従させる。
      e.preventDefault();
      lastWheelSwitchAtRef.current = now;
      dispatch({ type: "SELECT_TAB", tabId: tabs[nextIdx].id });
    },
    [dispatch, isVertical, paneId, stateRef],
  );

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const nativeHandler = (ev: WheelEvent) => handleWheel(ev);
    el.addEventListener("wheel", nativeHandler, { passive: false });
    return () => {
      el.removeEventListener("wheel", nativeHandler);
    };
  }, [handleWheel]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tab: Tab) => {
    e.preventDefault();
    // タブ個別メニューのみ開き、タブバー背景へのバブルアップを止める
    e.stopPropagation();
    setContextMenu({ tab, x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // タブバーの空白部分を右クリックしたときのメニュー
  const handleBarContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target;
    // 個別メニューは座標付きの仮想Triggerをタブバー内へ挿入するため、
    // そのイベントを背景メニューとして二重に扱わない。
    if (
      target instanceof Element &&
      target.closest(
        ".tab, .tab-bar__add, .tab-bar__refresh, .tab-bar__bookmark, [data-context-menu-trigger], [data-popup='true']",
      )
    ) {
      return;
    }

    e.preventDefault();
    setBarContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeBarContextMenu = useCallback(() => setBarContextMenu(null), []);

  const handleDragEnd = useCallback(
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    (event: any) => {
      // event.canceled はドラッグがキャンセル（Esc キーなど）された場合に true になる。
      if (event.canceled) return;
      const { operation } = event;
      if (!isSortableOperation(operation)) return;
      const { source } = operation;
      if (!source) return;
      // 変更理由: OptimisticSortingPlugin がドラッグ中に確定させたグループ内の最終位置を
      // source.sortable.index として受け取り、それをそのまま並べ替えの真実にする。
      // ドロップ先タブIDから逆算すると投影インデックスとズレるため使わない。
      const toIndex = source.index;
      const initialIndex = source.sortable?.initialIndex;
      if (typeof toIndex !== "number") return;
      // 実際に位置が変わっていなければ、click 抑止も並べ替えも行わない。
      if (typeof initialIndex === "number" && toIndex === initialIndex) return;
      // ドラッグ完了直後の click イベントによるタブ選択を1回だけ抑止する。
      wasDraggingRef.current = true;
      dispatch({
        type: "MOVE_TAB",
        dragTabId: String(source.id),
        toIndex,
      });
    },
    [dispatch],
  );

  const handleTabSelect = useCallback(
    (tabId: string) => {
      dispatch({ type: "SELECT_TAB", tabId });
    },
    [dispatch],
  );

  const handleTabClose = useCallback(
    (tabId: string) => {
      dispatch({ type: "CLOSE_TAB", tabId });
    },
    [dispatch],
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 変更理由: タブのドラッグ並べ替えと幅変更の当たり判定が干渉しないよう、
      // 幅変更は右端の専用ハンドルだけで開始する。
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      resizeStartRef.current = { startX: e.clientX, startWidth: dragWidth ?? width };
    },
    [dragWidth, width],
  );

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    const start = resizeStartRef.current;
    if (!start) return;
    const next = clampTabBarWidth(start.startWidth + (e.clientX - start.startX));
    dragWidthRef.current = next;
    setDragWidth(next);
  }, []);

  const handleResizePointerUp = useCallback(() => {
    resizeStartRef.current = null;
    const finalWidth = dragWidthRef.current;
    dragWidthRef.current = null;
    setDragWidth(null);
    // 変更理由: 確定した幅だけを保存し、ドラッグ中の連続書き込みを避ける。
    if (finalWidth != null) {
      setWidth(finalWidth);
    }
  }, [setWidth]);

  const handleResizePointerCancel = useCallback(() => {
    // 変更理由: 中断時は操作中の幅を破棄し、保存済みの幅へ戻す。
    resizeStartRef.current = null;
    dragWidthRef.current = null;
    setDragWidth(null);
  }, []);

  const handleArrowNavigate = useCallback(
    (index: number, delta: number) => {
      const tabs = state.tabs;
      if (tabs.length === 0) return;
      const nextIndex = (index + delta + tabs.length) % tabs.length;
      const nextTab = tabs[nextIndex];
      if (!nextTab) return;
      dispatch({ type: "SELECT_TAB", tabId: nextTab.id });
      // フォーカスも追従させ、連続した矢印キー操作を可能にする。
      tabListRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]")[nextIndex]?.focus();
    },
    [dispatch, state.tabs],
  );

  const barMenuItems = useMemo(
    () => [
      {
        id: "new-tab",
        label: "新しいタブを開く",
        icon: <Plus size={16} />,
        onSelect: () => dispatch({ type: "ADD_TAB" }),
      },
      {
        id: "reopen",
        label: "閉じたタブを開く",
        disabled: state.closedTabs.length === 0,
        icon: <RotateCcw size={16} />,
        onSelect: () => dispatch({ type: "REOPEN_CLOSED_TAB" }),
      },
      {
        id: "toggle-orientation",
        label: isVertical ? "タブバーを水平にする" : "タブバーを垂直にする",
        icon: isVertical ? <PanelTop size={16} /> : <PanelLeft size={16} />,
        onSelect: () => {
          // 変更理由: 設定画面を開かずに方向を試せるよう、タブバーの右クリックメニューから
          // 切り替える。config_updated 経由で useTabBarOrientation が即時反映する。
          void Promise.resolve(
            container.config.set(
              TAB_BAR_ORIENTATION_CONFIG_KEY,
              isVertical ? "horizontal" : "vertical",
            ),
          ).catch((error) => {
            console.error("[TabBar] タブバー方向の保存に失敗しました", error);
          });
        },
      },
    ],
    [dispatch, isVertical, state.closedTabs.length],
  );

  const addTabButton = (
    <button
      type="button"
      className="tab-bar__add"
      onClick={() => dispatch({ type: "ADD_TAB" })}
      onContextMenu={(e) => e.stopPropagation()}
      title="新しいタブ"
      aria-label="新しいタブ"
    >
      <Plus size={16} />
    </button>
  );

  const displayWidth = dragWidth ?? width;

  const refreshButton = (
    <button
      type="button"
      className="tab-bar__refresh"
      disabled={!canRefresh}
      onClick={() => dispatch({ type: "RELOAD" })}
      title="更新"
      aria-label="更新"
    >
      <RotateCw size={16} />
    </button>
  );

  return (
    <div
      ref={barRef}
      className={`tab-bar${isVertical ? " tab-bar--vertical" : ""}${
        isVertical && collapsed ? " tab-bar--collapsed" : ""
      }${isVertical && dragWidth != null ? " tab-bar--resizing" : ""}`}
      // 変更理由: 簡易表示では幅をCSSの固定値に任せ、展開表示とドラッグ中だけ操作幅を使う。
      // ドラッグ中のタブがバー幅以上に広がらないよう、実幅をCSS変数でも共有する。
      style={
        isVertical && !collapsed
          ? ({
              width: displayWidth,
              "--tab-bar-width": `${displayWidth}px`,
            } as React.CSSProperties)
          : undefined
      }
      onContextMenu={handleBarContextMenu}
    >
      {isVertical ? (
        <>
          {refreshButton}
          <span className="tab-bar__refresh-divider" aria-hidden="true" />
          <div className="tab-bar__vertical-header">
            <button
              type="button"
              className="tab-bar__collapse"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? "展開表示に戻す" : "簡易表示にする"}
              aria-label={collapsed ? "展開表示に戻す" : "簡易表示にする"}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </>
      ) : (
        <>
          {refreshButton}
          <span className="tab-bar__refresh-divider" aria-hidden="true" />
        </>
      )}
      <DragDropProvider onDragEnd={handleDragEnd}>
        <div
          className={`tab-list-container${
            tabListScrollState.canScrollLeft ? " tab-list-container--can-scroll-left" : ""
          }${tabListScrollState.canScrollRight ? " tab-list-container--can-scroll-right" : ""}${
            tabListScrollState.canScrollTop ? " tab-list-container--can-scroll-top" : ""
          }${tabListScrollState.canScrollBottom ? " tab-list-container--can-scroll-bottom" : ""}`}
        >
          <div
            ref={tabListRef}
            className="tab-list"
            role="tablist"
            aria-orientation={isVertical ? "vertical" : "horizontal"}
          >
            {state.tabs.map((tab, index) => {
              const page = getCurrentPage(tab);
              const isActive = tab.id === state.activeTabId;
              const isPageAutoRefreshEnabled = isAutoRefreshEnabledForPage(tab, page);
              // 変更理由: スレ/スレ一覧どちらも同じページ単位の自動更新として扱い、
              // タブ上の表示だけ別判定になってズレるのを防ぐ。
              const autoRefreshIndicatorState: "active" | "inactive" | null =
                page.type === "thread" || page.type === "threadList"
                  ? isPageAutoRefreshEnabled
                    ? page.type === "thread"
                      ? isActive && !isPaused && (canAutoScroll || isAutoScrolling)
                        ? "active"
                        : "inactive"
                      : isActive
                        ? "active"
                        : "inactive"
                    : null
                  : null;

              return (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  index={index}
                  isActive={isActive}
                  isHighlighted={highlightedTabIds.has(tab.id)}
                  autoRefreshIndicatorState={autoRefreshIndicatorState}
                  tabCount={state.tabs.length}
                  isVertical={isVertical}
                  compact={isVertical && collapsed}
                  wasDraggingRef={wasDraggingRef}
                  onSelect={handleTabSelect}
                  onClose={handleTabClose}
                  onContextMenu={handleContextMenu}
                  onArrowNavigate={handleArrowNavigate}
                />
              );
            })}
            {/* 変更理由: 垂直モードでは追加ボタンを下部へ常に固定し、タブが多いときも
                到達しやすくする。水平モードの出し分けは従来どおり保つ。 */}
            {!isVertical && !isTabListScrollable ? addTabButton : null}
          </div>
        </div>
      </DragDropProvider>
      {/* タブが横幅を超えるときだけ、追加ボタンをスクロール領域の外へ固定する。 */}
      {isVertical ? (
        <>
          <div className="tab-bar__vertical-footer">{addTabButton}</div>
          {/* 変更理由: 簡易表示では幅が固定のため、展開表示のときだけ幅変更ハンドルを出す。 */}
          {!collapsed && (
            <div
              className="tab-bar__resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="タブバーの幅を変更"
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={handleResizePointerCancel}
            />
          )}
        </>
      ) : isTabListScrollable ? (
        addTabButton
      ) : null}

      {/* 変更理由: お気に入り操作はURLバー展開後とナビゲーションメニューに残すため、
          タブバー右端には表示せず、バー開閉ボタン付近の重複を避ける。 */}
      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.tab}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
        />
      )}

      {barContextMenu && (
        <ContextMenu
          x={barContextMenu.x}
          y={barContextMenu.y}
          items={barMenuItems}
          onClose={closeBarContextMenu}
        />
      )}
    </div>
  );
};
