import { Plus, X } from "lucide-react";
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

  // ミドルクリック（ボタン1）でタブを閉じる
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      if (e.button === 1) {
        e.preventDefault();
        dispatch({ type: "CLOSE_TAB", tabId });
      }
    },
    [dispatch],
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

          return (
            <div
              key={tab.id}
              className={`tab ${isActive ? "tab--active" : ""} ${
                tab.pinned ? "tab--pinned" : ""
              }${highlightedTabIds.has(tab.id) ? " tab--highlighted" : ""}`}
              title={page.title}
              onClick={() => dispatch({ type: "SELECT_TAB", tabId: tab.id })}
              onMouseDown={(e) => handleMouseDown(e, tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab)}
            >
              <span className="tab__title">{page.title}</span>
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
