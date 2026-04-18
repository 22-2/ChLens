import { ArrowLeft, ArrowRight, Menu, RotateCw, Search, Settings } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import {
  canGoBack,
  canGoForward,
  getCurrentPage,
  getDisplayUrl,
} from "src/view/browser/types";

interface MenuPosition {
  x: number;
  y: number;
}

// URLバーからの入力でページ種別を推定してナビゲートする
function navigateByUrl(
  url: string,
  dispatch: ReturnType<typeof useTabStore>["dispatch"],
) {
  const trimmed = url.trim();
  if (!trimmed) return;

  // スレッドURL判定: /test/read.cgi/ を含む
  if (/\/test\/read\.cgi\//.test(trimmed)) {
    dispatch({
      type: "NAVIGATE",
      page: { type: "thread", title: trimmed, threadUrl: trimmed },
    });
    return;
  }

  // 板URL判定: http(s)で始まるURL
  if (/^https?:\/\//.test(trimmed)) {
    dispatch({
      type: "NAVIGATE",
      page: {
        type: "threadList",
        title: trimmed,
        boardUrl: trimmed,
        boardTitle: trimmed,
      },
    });
    return;
  }
}

export const NavigationBar: React.FC = () => {
  const { state, activeTab, currentPage, dispatch } = useTabStore();

  const back = canGoBack(activeTab);
  const forward = canGoForward(activeTab);
  const displayUrl = getDisplayUrl(currentPage);

  const [inputValue, setInputValue] = useState(displayUrl);
  const [isFocused, setIsFocused] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [backMenuPosition, setBackMenuPosition] = useState<MenuPosition | null>(
    null,
  );
  const [forwardMenuPosition, setForwardMenuPosition] =
    useState<MenuPosition | null>(null);

  // ページ遷移時にURLバーの表示を同期
  useEffect(() => {
    if (!isFocused) {
      setInputValue(displayUrl);
    }
  }, [displayUrl, isFocused]);

  const handleRefresh = useCallback(() => {
    dispatch({ type: "RELOAD" });
  }, [dispatch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        navigateByUrl(inputValue, dispatch);
        (e.target as HTMLInputElement).blur();
      }
    },
    [inputValue, dispatch],
  );

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Chrome風: フォーカス時に全選択
    e.target.select();
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // フォーカスを外したら現在のURLに戻す
    setInputValue(displayUrl);
  }, [displayUrl]);

  const openSettingsTab = useCallback(() => {
    // 設定タブを毎回増やすより既存タブを再利用した方が往復しやすいため、まず開いている設定を探す。
    const existingSettingsTab = state.tabs.find(
      (tab) => getCurrentPage(tab).type === "settings",
    );

    if (existingSettingsTab) {
      dispatch({ type: "SELECT_TAB", tabId: existingSettingsTab.id });
      return;
    }

    dispatch({ type: "ADD_TAB" });
    dispatch({
      type: "NAVIGATE",
      page: { type: "settings", title: "設定" },
    });
  }, [dispatch, state.tabs]);

  const handleMenuClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setBackMenuPosition(null);
      setForwardMenuPosition(null);
      setMenuPosition((prev) => {
        if (prev) {
          return null;
        }
        return {
          x: Math.max(8, rect.right - 220),
          y: rect.bottom + 4,
        };
      });
    },
    [],
  );

  const closeMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  const closeBackMenu = useCallback(() => {
    setBackMenuPosition(null);
  }, []);

  const closeForwardMenu = useCallback(() => {
    setForwardMenuPosition(null);
  }, []);

  const handleBackContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!back) return;
      setMenuPosition(null);
      setForwardMenuPosition(null);
      setBackMenuPosition({ x: e.clientX, y: e.clientY });
    },
    [back],
  );

  const handleForwardContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!forward) return;
      setMenuPosition(null);
      setBackMenuPosition(null);
      setForwardMenuPosition({ x: e.clientX, y: e.clientY });
    },
    [forward],
  );

  const openSearchFromMenu = useCallback(() => {
    // Ctrl+Fでは開かず、URLバー右メニューからのみ開く要件のため、
    // NavigationBarからThreadPageへ明示イベントを送る。
    window.dispatchEvent(new window.CustomEvent("thread-search-open"));
  }, []);

  const backHistoryItems = useMemo(
    () =>
      activeTab.history
        .map((page, index) => ({ page, index }))
        .filter(({ index }) => index < activeTab.currentIndex)
        .sort((a, b) => b.index - a.index)
        .map(({ page, index }) => ({
          id: `back-${index}`,
          label: page.title,
          onSelect: () => dispatch({ type: "GO_TO_HISTORY_INDEX", index }),
          onAuxSelect: (button: number) => {
            if (button !== 1) return;
            dispatch({ type: "OPEN_IN_NEW_TAB", page });
          },
        })),
    [activeTab.currentIndex, activeTab.history, dispatch],
  );

  const forwardHistoryItems = useMemo(
    () =>
      activeTab.history
        .map((page, index) => ({ page, index }))
        .filter(({ index }) => index > activeTab.currentIndex)
        .sort((a, b) => a.index - b.index)
        .map(({ page, index }) => ({
          id: `forward-${index}`,
          label: page.title,
          onSelect: () => dispatch({ type: "GO_TO_HISTORY_INDEX", index }),
          onAuxSelect: (button: number) => {
            if (button !== 1) return;
            dispatch({ type: "OPEN_IN_NEW_TAB", page });
          },
        })),
    [activeTab.currentIndex, activeTab.history, dispatch],
  );

  const menuItems = useMemo(
    () => [
      ...(currentPage.type === "thread"
        ? [
            {
              id: "open-search",
              label: "検索を開く",
              icon: <Search size={14} />,
              onSelect: openSearchFromMenu,
            },
          ]
        : []),
      {
        id: "open-settings",
        label: "設定を開く",
        icon: <Settings size={14} />,
        onSelect: openSettingsTab,
      },
    ],
    [currentPage.type, openSearchFromMenu, openSettingsTab],
  );

  return (
    <div className="nav-bar">
      <button
        className="nav-bar__btn"
        disabled={!back}
        onClick={() => dispatch({ type: "GO_BACK" })}
        onContextMenu={handleBackContextMenu}
        title="戻る"
      >
        <ArrowLeft size={18} />
      </button>
      <button
        className="nav-bar__btn"
        disabled={!forward}
        onClick={() => dispatch({ type: "GO_FORWARD" })}
        onContextMenu={handleForwardContextMenu}
        title="進む"
      >
        <ArrowRight size={18} />
      </button>
      <button className="nav-bar__btn" onClick={handleRefresh} title="更新">
        <RotateCw size={16} />
      </button>

      <div className="nav-bar__url">
        <input
          className="nav-bar__url-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="URLを入力"
          spellCheck={false}
        />
      </div>

      <button className="nav-bar__btn" title="メニュー" onClick={handleMenuClick}>
        <Menu size={18} />
      </button>

      {menuPosition && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          items={menuItems}
          onClose={closeMenu}
        />
      )}

      {backMenuPosition && backHistoryItems.length > 0 && (
        <ContextMenu
          x={backMenuPosition.x}
          y={backMenuPosition.y}
          items={backHistoryItems}
          onClose={closeBackMenu}
        />
      )}

      {forwardMenuPosition && forwardHistoryItems.length > 0 && (
        <ContextMenu
          x={forwardMenuPosition.x}
          y={forwardMenuPosition.y}
          items={forwardHistoryItems}
          onClose={closeForwardMenu}
        />
      )}
    </div>
  );
};
