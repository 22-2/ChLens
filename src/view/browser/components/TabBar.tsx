import { Pin, Plus, X } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { TabContextMenu } from "src/view/browser/components/TabContextMenu";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";

interface ContextMenuState {
  tab: Tab;
  x: number;
  y: number;
}

interface BarContextMenuState {
  x: number;
  y: number;
}

const TAB_SWITCH_WHEEL_MIN_DELTA = 8;
const TAB_SWITCH_WHEEL_COOLDOWN_MS = 50;

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
  isAutoRefreshActive: boolean;
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
  isAutoRefreshActive,
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
      {/* 自動更新が有効なタブにはタイトルの右隣に状態インジケーターを表示する */}
      {isAutoRefreshActive && !tab.pinned && (
        <span
          className="tab__auto-refresh-dot"
          title="自動更新: ON"
          aria-label="自動更新有効"
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
  const { state, dispatch } = useTabStore();
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
      // 小さい慣性入力や横スクロール成分は無視し、hover中の誤連打切替を防ぐ。
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      if (Math.abs(e.deltaY) < TAB_SWITCH_WHEEL_MIN_DELTA) return;

      const now = Date.now();
      if (now - lastWheelSwitchAtRef.current < TAB_SWITCH_WHEEL_COOLDOWN_MS) {
        return;
      }

      const tabs = state.tabs;
      const currentIdx = tabs.findIndex((t) => t.id === state.activeTabId);
      if (currentIdx === -1) return;

      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 : -1;
      const nextIdx = (currentIdx + delta + tabs.length) % tabs.length;
      lastWheelSwitchAtRef.current = now;
      dispatch({ type: "SELECT_TAB", tabId: tabs[nextIdx].id });
    },
    [dispatch, state.activeTabId, state.tabs],
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
      const { source, target } = operation;
      if (!target || source?.id === target.id) return;
      // ドラッグ完了直後の click イベントによるタブ選択を1回だけ抑止する。
      wasDraggingRef.current = true;
      dispatch({
        type: "MOVE_TAB",
        dragTabId: String(source?.id),
        targetTabId: String(target.id),
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
            // 自動更新有効判定: タブに登録された URL と現在ページの URL が一致する時のみ有効。
            // 別スレへ遷移後に無案内に再読み込みが走るのを防ぐため。
            const isAutoRefreshActive =
              page.type === "thread" &&
              tab.autoRefreshEnabled &&
              tab.autoRefreshThreadUrl === page.threadUrl;

            return (
              <SortableTab
                key={tab.id}
                tab={tab}
                index={index}
                isActive={isActive}
                isHighlighted={highlightedTabIds.has(tab.id)}
                isAutoRefreshActive={isAutoRefreshActive}
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
