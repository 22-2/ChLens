import { DragDropProvider } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";
import { Pin, Plus, RotateCcw, RotateCw, X } from "lucide-react";
import normalizeWheel from "normalize-wheel";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCursorTooltip } from "src/view/browser/components/CursorTooltip";
import { TabContextMenu } from "src/view/browser/components/TabContextMenu";
import { useAutoScrollState } from "src/view/browser/hooks/use-auto-scroll-state";
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
  wasDraggingRef: React.MutableRefObject<boolean>;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onContextMenu: (e: React.MouseEvent, tab: Tab) => void;
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
  wasDraggingRef,
  onSelect,
  onClose,
  onContextMenu,
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

  return (
    <>
      <div
        ref={ref}
        className={`tab${isActive ? " tab--active" : ""}${
          tab.pinned ? " tab--pinned" : ""
        }${isHighlighted ? " tab--highlighted" : ""}${isDragSource ? " tab--dragging" : ""}`}
        data-tab-id={tab.id}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseEnter={(event) => show(page.title, event)}
        onMouseMove={(event) => move(page.title, event)}
        onMouseLeave={hide}
        onContextMenu={(e) => {
          hide();
          onContextMenu(e, tab);
        }}
      >
        {tab.pinned ? <Pin size={11} /> : <span className="tab__title">{page.title}</span>}
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

export const TabBar: React.FC = () => {
  const { state, stateRef, dispatch, paneId } = useTabStore();
  const { canAutoScroll, isAutoScrolling, isPaused } = useAutoScrollState();
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
  });

  const updateTabListScrollState = useCallback(() => {
    const tabList = tabListRef.current;
    if (!tabList) return;

    const maxScrollLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
    const nextState = {
      canScrollLeft: tabList.scrollLeft > 1,
      canScrollRight: tabList.scrollLeft < maxScrollLeft - 1,
    };

    setTabListScrollState((previous) =>
      previous.canScrollLeft === nextState.canScrollLeft &&
      previous.canScrollRight === nextState.canScrollRight
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
    const isOutsideViewport = tabRect.left < tabListRect.left || tabRect.right > tabListRect.right;
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
    [dispatch, paneId, stateRef],
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
        ".tab, .tab-bar__add, .tab-bar__refresh, [data-context-menu-trigger], [data-popup='true']",
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
    ],
    [dispatch, state.closedTabs.length],
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

  return (
    <div ref={barRef} className="tab-bar" onContextMenu={handleBarContextMenu}>
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
      <span className="tab-bar__refresh-divider" aria-hidden="true" />
      <DragDropProvider onDragEnd={handleDragEnd}>
        <div
          className={`tab-list-container${
            tabListScrollState.canScrollLeft ? " tab-list-container--can-scroll-left" : ""
          }${tabListScrollState.canScrollRight ? " tab-list-container--can-scroll-right" : ""}`}
        >
          <div ref={tabListRef} className="tab-list">
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
                  wasDraggingRef={wasDraggingRef}
                  onSelect={handleTabSelect}
                  onClose={handleTabClose}
                  onContextMenu={handleContextMenu}
                />
              );
            })}
            {!isTabListScrollable ? addTabButton : null}
          </div>
        </div>
      </DragDropProvider>
      {/* タブが横幅を超えるときだけ、追加ボタンをスクロール領域の外へ固定する。 */}
      {isTabListScrollable ? addTabButton : null}

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
