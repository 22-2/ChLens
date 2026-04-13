import { Plus, X } from "lucide-react";
import React, { useCallback, useState } from "react";
import { TabContextMenu } from "src/view/browser/components/TabContextMenu";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";

interface ContextMenuState {
  tab: Tab;
  x: number;
  y: number;
}

export const TabBar: React.FC = () => {
  const { state, dispatch } = useTabStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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

  const handleContextMenu = useCallback((e: React.MouseEvent, tab: Tab) => {
    e.preventDefault();
    setContextMenu({ tab, x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  return (
    <div className="tab-bar">
      <div className="tab-list">
        {state.tabs.map((tab) => {
          const page = getCurrentPage(tab);
          const isActive = tab.id === state.activeTabId;

          return (
            <div
              key={tab.id}
              className={`tab ${isActive ? "tab--active" : ""} ${tab.pinned ? "tab--pinned" : ""}`}
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
    </div>
  );
};
