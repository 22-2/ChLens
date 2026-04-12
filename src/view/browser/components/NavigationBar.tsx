import React, { useCallback } from "react";
import { useTabStore } from "../hooks/use-tab-store";
import { canGoBack, canGoForward, getDisplayUrl } from "../types";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Menu,
} from "lucide-react";

export const NavigationBar: React.FC = () => {
  const { activeTab, currentPage, dispatch } = useTabStore();

  const back = canGoBack(activeTab);
  const forward = canGoForward(activeTab);
  const displayUrl = getDisplayUrl(currentPage);

  const handleRefresh = useCallback(() => {
    // ページの再描画トリガー：同じページに再ナビゲートする
    dispatch({ type: "NAVIGATE", page: { ...currentPage } });
  }, [currentPage, dispatch]);

  return (
    <div className="nav-bar">
      <button
        className="nav-bar__btn"
        disabled={!back}
        onClick={() => dispatch({ type: "GO_BACK" })}
        title="戻る"
      >
        <ArrowLeft size={18} />
      </button>
      <button
        className="nav-bar__btn"
        disabled={!forward}
        onClick={() => dispatch({ type: "GO_FORWARD" })}
        title="進む"
      >
        <ArrowRight size={18} />
      </button>
      <button
        className="nav-bar__btn"
        onClick={handleRefresh}
        title="更新"
      >
        <RotateCw size={16} />
      </button>

      <div className="nav-bar__url">
        <span className="nav-bar__url-text">{displayUrl}</span>
      </div>

      <button className="nav-bar__btn" title="メニュー">
        <Menu size={18} />
      </button>
    </div>
  );
};
