import { Pin, Plus, X } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
const TAB_REORDER_DRAG_THRESHOLD_PX = 3;

interface TabDragState {
  dragTabId: string;
  startX: number;
  startY: number;
  isDragging: boolean;
  orderedTabIds: string[];
}

export const TabBar: React.FC = () => {
  const { state, dispatch } = useTabStore();
  const barRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [barContextMenu, setBarContextMenu] =
    useState<BarContextMenuState | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [highlightedTabIds, setHighlightedTabIds] = useState<Set<string>>(
    new Set(),
  );
  const prevTabIdsRef = useRef<Set<string>>(
    new Set(state.tabs.map((tab) => tab.id)),
  );
  const lastWheelSwitchAtRef = useRef(0);
  const movedDuringDragRef = useRef(false);
  const tabDragStateRef = useRef<TabDragState | null>(null);

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

  // 中クリックで閉じる操作を維持しつつ、左クリックではタブ並べ替えのドラッグ候補を開始する。
  const handleTabMouseDown = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      if (e.button === 1) {
        e.preventDefault();
        dispatch({ type: "CLOSE_TAB", tabId });
        return;
      }
      if (e.button !== 0) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target?.closest(".tab__close")) {
        return;
      }

      movedDuringDragRef.current = false;
      tabDragStateRef.current = {
        dragTabId: tabId,
        startX: e.clientX,
        startY: e.clientY,
        isDragging: false,
        orderedTabIds: state.tabs.map((tab) => tab.id),
      };
    },
    [dispatch, state.tabs],
  );

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

  const handleWindowMouseMove = useCallback(
    (e: MouseEvent) => {
      const drag = tabDragStateRef.current;
      if (!drag) {
        return;
      }

      if (!drag.isDragging) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.hypot(dx, dy) < TAB_REORDER_DRAG_THRESHOLD_PX) {
          return;
        }
        drag.isDragging = true;
        setDraggingTabId(drag.dragTabId);
      }

      const bar = barRef.current;
      if (!bar) {
        return;
      }

      const rect = bar.getBoundingClientRect();
      // バー外へ出た位置では並べ替えを止め、タブ列の秩序を崩さないようにする。
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        (e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom)
      ) {
        return;
      }

      const tabElements = Array.from(
        bar.querySelectorAll<HTMLElement>(".tab[data-tab-id]"),
      );
      if (tabElements.length <= 1) {
        return;
      }

      const tabElementById = new Map<string, HTMLElement>();
      for (const element of tabElements) {
        const tabId = element.dataset.tabId;
        if (tabId) {
          tabElementById.set(tabId, element);
        }
      }

      let currentIndex = drag.orderedTabIds.indexOf(drag.dragTabId);
      if (currentIndex === -1) {
        return;
      }

      while (true) {
        const nextTabId = drag.orderedTabIds[currentIndex + 1];
        const prevTabId = drag.orderedTabIds[currentIndex - 1];
        const nextTabElement = nextTabId ? tabElementById.get(nextTabId) : null;
        const prevTabElement = prevTabId ? tabElementById.get(prevTabId) : null;

        if (nextTabId && nextTabElement) {
          const nextRect = nextTabElement.getBoundingClientRect();
          const nextMidX = nextRect.left + nextRect.width / 2;
          if (e.clientX > nextMidX) {
            dispatch({
              type: "MOVE_TAB",
              dragTabId: drag.dragTabId,
              targetTabId: nextTabId,
            });
            movedDuringDragRef.current = true;
            const reordered = [...drag.orderedTabIds];
            [reordered[currentIndex], reordered[currentIndex + 1]] = [
              reordered[currentIndex + 1],
              reordered[currentIndex],
            ];
            drag.orderedTabIds = reordered;
            currentIndex += 1;
            continue;
          }
        }

        if (prevTabId && prevTabElement) {
          const prevRect = prevTabElement.getBoundingClientRect();
          const prevMidX = prevRect.left + prevRect.width / 2;
          if (e.clientX < prevMidX) {
            dispatch({
              type: "MOVE_TAB",
              dragTabId: drag.dragTabId,
              targetTabId: prevTabId,
            });
            movedDuringDragRef.current = true;
            const reordered = [...drag.orderedTabIds];
            [reordered[currentIndex - 1], reordered[currentIndex]] = [
              reordered[currentIndex],
              reordered[currentIndex - 1],
            ];
            drag.orderedTabIds = reordered;
            currentIndex -= 1;
            continue;
          }
        }

        break;
      }
    },
    [dispatch],
  );

  const handleWindowMouseUp = useCallback(() => {
    if (!tabDragStateRef.current) {
      return;
    }
    tabDragStateRef.current = null;
    setDraggingTabId(null);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("blur", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("blur", handleWindowMouseUp);
    };
  }, [handleWindowMouseMove, handleWindowMouseUp]);

  const handleTabClick = useCallback(
    (tabId: string) => {
      if (movedDuringDragRef.current) {
        // ドラッグ直後に click が合成される環境があるため、意図しないタブ選択を1回だけ抑止する。
        movedDuringDragRef.current = false;
        return;
      }
      dispatch({ type: "SELECT_TAB", tabId });
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
      <div className="tab-list">
        {state.tabs.map((tab) => {
          const page = getCurrentPage(tab);
          const isActive = tab.id === state.activeTabId;
          // 自動更新有効判定: タブに登録された URL と現在ページの URL が一致する時のみ有効扣。
          // 別スレへ遷移後に無案内に再読み込みが走るのを防ぐため。
          const isAutoRefreshActive =
            page.type === "thread" &&
            tab.autoRefreshEnabled &&
            tab.autoRefreshThreadUrl === page.threadUrl;

          return (
            <div
              key={tab.id}
              className={`tab ${isActive ? "tab--active" : ""} ${
                tab.pinned ? "tab--pinned" : ""
              }${highlightedTabIds.has(tab.id) ? " tab--highlighted" : ""}${
                draggingTabId === tab.id ? " tab--dragging" : ""
              }`}
              data-tab-id={tab.id}
              title={page.title}
              onClick={() => handleTabClick(tab.id)}
              onMouseDown={(e) => handleTabMouseDown(e, tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab)}
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
              {!tab.pinned && state.tabs.length > 1 && (
                <button
                  className="tab__close"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "CLOSE_TAB", tabId: tab.id });
                  }}
                  title="タブを閉じる"
                >
                  <X size={14} />
                </button>
              )}
            </div>
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
