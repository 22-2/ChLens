import { DragDropProvider } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";
import { Pin, Plus, SplitSquareHorizontal, X } from "lucide-react";
import normalizeWheel from "normalize-wheel";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { TabContextMenu } from "src/view/browser/components/TabContextMenu";
import { useAutoScrollState } from "src/view/browser/hooks/use-auto-scroll-state";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";
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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 中クリックはドラッグではなく閉じる操作として処理する。
      if (e.button === 1) {
        e.preventDefault();
        onClose(tab.id);
      }
    },
    [tab.id, onClose],
  );

  const handleClick = useCallback(() => {
    // ドラッグ終了直後に合成される click でタブが切り替わるのを1回だけ抑止する。
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }
    onSelect(tab.id);
  }, [tab.id, wasDraggingRef, onSelect]);

  return (
    <div
      ref={ref}
      className={`tab${isActive ? " tab--active" : ""}${
        tab.pinned ? " tab--pinned" : ""
      }${isHighlighted ? " tab--highlighted" : ""}${
        isDragSource ? " tab--dragging" : ""
      }`}
      data-tab-id={tab.id}
      title={page.title}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => onContextMenu(e, tab)}
    >
      {tab.pinned ? (
        <Pin size={12} />
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
          title={
            autoRefreshIndicatorState === "active"
              ? "自動更新: 動作中"
              : "自動更新: 待機中"
          }
          aria-label={
            autoRefreshIndicatorState === "active"
              ? "自動更新動作中"
              : "自動更新待機中"
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
          <X size={14} />
        </button>
      )}
    </div>
  );
};

export const TabBar: React.FC = () => {
  const { state, stateRef, dispatch, paneId } = useTabStore();
  const { canAutoScroll, isAutoScrolling, isPaused } = useAutoScrollState();
  const barRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [barContextMenu, setBarContextMenu] =
    useState<BarContextMenuState | null>(null);
  const [highlightedTabIds, setHighlightedTabIds] = useState<Set<string>>(
    new Set(),
  );
  const prevTabIdsRef = useRef<Set<string>>(
    new Set(state.tabs.map((tab) => tab.id)),
  );
  const lastWheelSwitchAtRef = useRef(0);
  // ドラッグ終了直後の click イベントによるタブ選択を抑止するためのフラグ。
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    const prev = prevTabIdsRef.current;
    const current = new Set(state.tabs.map((tab) => tab.id));
    const newIds = state.tabs
      .map((tab) => tab.id)
      .filter((tabId) => !prev.has(tabId));

    if (newIds.length > 0) {
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
  }, [state.tabs]);

  useEffect(() => {
    prevTabIdsRef.current = new Set(state.tabs.map((tab) => tab.id));
  }, [state.tabs]);

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
          2 *
            (Math.abs(normalizedWheel.pixelX) +
              Math.abs(normalizedWheel.pixelY)),
      );
      if (now - lastWheelSwitchAtRef.current < cooldownMs) {
        return;
      }

      // stateRef はグローバル状態を指すので、自ペインを解決してからタブ列を取り出す。
      const pane =
        stateRef.current.panes.find((p) => p.id === paneId) ??
        stateRef.current.panes.find(
          (p) => p.id === stateRef.current.activePaneId,
        );
      if (!pane) return;
      const tabs = pane.tabs;
      const currentIdx = tabs.findIndex((t) => t.id === pane.activeTabId);
      if (currentIdx === -1) return;

      // 変更理由: ブラウザごとの生の delta 符号差を normalize-wheel で吸収し、
      // 正規化後に正なら下/右、負なら上/左として一貫して扱う。
      const delta = wheelDistance > 0 ? 1 : -1;
      const nextIdx = (currentIdx + delta + tabs.length) % tabs.length;

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
    e.preventDefault();
    setBarContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeBarContextMenu = useCallback(() => setBarContextMenu(null), []);

  const handleDragEnd = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        onSelect: () => dispatch({ type: "ADD_TAB" }),
      },
      {
        id: "reopen",
        label: "閉じたタブを開く",
        disabled: state.closedTabs.length === 0,
        onSelect: () => dispatch({ type: "REOPEN_CLOSED_TAB" }),
      },
    ],
    [dispatch, state.closedTabs.length],
  );

  return (
    <div ref={barRef} className="tab-bar" onContextMenu={handleBarContextMenu}>
      <DragDropProvider onDragEnd={handleDragEnd}>
        <div className="tab-list">
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
          {/* タブリスト内に配置して最後のタブのすぐ隣に表示 */}
          <button
            className="tab-bar__add"
            onClick={() => dispatch({ type: "ADD_TAB" })}
            onContextMenu={(e) => e.stopPropagation()}
            title="新しいタブ"
          >
            <Plus size={18} />
          </button>
          {/* このペインの右隣に新しいペインを開く（横分割） */}
          <button
            className="tab-bar__split"
            onClick={() => dispatch({ type: "SPLIT_PANE" })}
            onContextMenu={(e) => e.stopPropagation()}
            title="右に分割"
          >
            <SplitSquareHorizontal size={16} />
          </button>
        </div>
      </DragDropProvider>

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
