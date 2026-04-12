import React from "react";
import { useTabStore } from "../hooks/use-tab-store";
import { getCurrentPage } from "../types";
import { X, Plus } from "lucide-react";

export const TabBar: React.FC = () => {
  const { state, dispatch } = useTabStore();

  return (
    <div className="tab-bar">
      <div className="tab-list">
        {state.tabs.map((tab) => {
          const page = getCurrentPage(tab);
          const isActive = tab.id === state.activeTabId;

          return (
            <div
              key={tab.id}
              className={`tab ${isActive ? "tab--active" : ""}`}
              onClick={() => dispatch({ type: "SELECT_TAB", tabId: tab.id })}
            >
              <span className="tab__title">{page.title}</span>
              {state.tabs.length > 1 && (
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
      </div>
      <button
        className="tab-bar__add"
        onClick={() => dispatch({ type: "ADD_TAB" })}
        title="新しいタブ"
      >
        <Plus size={18} />
      </button>
    </div>
  );
};
