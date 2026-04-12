import React, { useCallback, useState, useEffect } from "react";
import { useTabStore } from "../hooks/use-tab-store";
import { canGoBack, canGoForward, getDisplayUrl } from "../types";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Menu,
} from "lucide-react";

// URLバーからの入力でページ種別を推定してナビゲートする
function navigateByUrl(url: string, dispatch: ReturnType<typeof useTabStore>["dispatch"]) {
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
  const { activeTab, currentPage, dispatch } = useTabStore();

  const back = canGoBack(activeTab);
  const forward = canGoForward(activeTab);
  const displayUrl = getDisplayUrl(currentPage);

  const [inputValue, setInputValue] = useState(displayUrl);
  const [isFocused, setIsFocused] = useState(false);

  // ページ遷移時にURLバーの表示を同期
  useEffect(() => {
    if (!isFocused) {
      setInputValue(displayUrl);
    }
  }, [displayUrl, isFocused]);

  const handleRefresh = useCallback(() => {
    // ページの再描画トリガー：同じページに再ナビゲートする
    dispatch({ type: "NAVIGATE", page: { ...currentPage } });
  }, [currentPage, dispatch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        navigateByUrl(inputValue, dispatch);
        (e.target as HTMLInputElement).blur();
      }
    },
    [inputValue, dispatch]
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

      <button className="nav-bar__btn" title="メニュー">
        <Menu size={18} />
      </button>
    </div>
  );
};
