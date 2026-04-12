import React, { useEffect, useRef, useCallback } from "react";
import { useTabStore } from "../hooks/use-tab-store";
import { getCurrentPage } from "../types";
import type { Tab } from "../types";

interface MenuPosition {
  x: number;
  y: number;
}

interface Props {
  tab: Tab;
  position: MenuPosition;
  onClose: () => void;
}

export const TabContextMenu: React.FC<Props> = ({ tab, position, onClose }) => {
  const { state, dispatch } = useTabStore();
  const menuRef = useRef<HTMLDivElement>(null);

  const tabIndex = state.tabs.findIndex((t) => t.id === tab.id);
  const currentPage = getCurrentPage(tab);
  const isThread = currentPage.type === "thread";

  // 他のタブ（固定タブ除く、自分除く）が存在するか
  const hasOtherClosable = state.tabs.some(
    (t) => t.id !== tab.id && !t.pinned
  );
  // 右側に閉じられるタブがあるか
  const hasRightClosable = state.tabs
    .slice(tabIndex + 1)
    .some((t) => !t.pinned);
  // 閉じたタブがあるか
  const hasClosedTabs = state.closedTabs.length > 0;

  // メニュー外クリックで閉じる
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // ワンフレーム遅延して登録（右クリックイベント自体で閉じないように）
    const id = requestAnimationFrame(() => {
      document.addEventListener("mousedown", handleClick);
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  // メニュー位置をビューポート内に収める
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - 4}px`;
    }
  }, []);

  const action = useCallback(
    (fn: () => void) => {
      fn();
      onClose();
    },
    [onClose]
  );

  return (
    <div
      ref={menuRef}
      className="tab-context-menu"
      style={{ left: position.x, top: position.y }}
    >
      <button
        className="tab-context-menu__item"
        disabled={tab.pinned}
        onClick={() => action(() => dispatch({ type: "CLOSE_TAB", tabId: tab.id }))}
      >
        タブを閉じる
      </button>
      <button
        className="tab-context-menu__item"
        disabled={!hasOtherClosable}
        onClick={() =>
          action(() => dispatch({ type: "CLOSE_OTHER_TABS", tabId: tab.id }))
        }
      >
        他のタブを閉じる
      </button>
      <button
        className="tab-context-menu__item"
        disabled={!hasRightClosable}
        onClick={() =>
          action(() => dispatch({ type: "CLOSE_RIGHT_TABS", tabId: tab.id }))
        }
      >
        右側のタブを閉じる
      </button>
      <button
        className="tab-context-menu__item"
        disabled={!hasClosedTabs}
        onClick={() => action(() => dispatch({ type: "REOPEN_CLOSED_TAB" }))}
      >
        閉じたタブを開く
      </button>
      <button
        className="tab-context-menu__item"
        onClick={() => action(() => dispatch({ type: "CLOSE_ALL_TABS" }))}
      >
        すべて閉じる
      </button>

      <div className="tab-context-menu__separator" />

      {isThread && (
        <>
          <button
            className="tab-context-menu__item"
            onClick={() => {
              // スレッドの板へ移動: 現在のタブで板を開く
              const threadPage = currentPage as { threadUrl: string };
              const boardUrl = deriveBoardUrl(threadPage.threadUrl);
              action(() =>
                dispatch({
                  type: "NAVIGATE_TAB",
                  tabId: tab.id,
                  page: {
                    type: "threadList",
                    title: boardUrl,
                    boardUrl,
                    boardTitle: boardUrl,
                  },
                })
              );
            }}
          >
            板に移動
          </button>
          <div className="tab-context-menu__separator" />
        </>
      )}

      <button
        className="tab-context-menu__item"
        onClick={() =>
          action(() => dispatch({ type: "TOGGLE_PIN", tabId: tab.id }))
        }
      >
        {tab.pinned ? "タブの固定を解除" : "タブを固定"}
      </button>
    </div>
  );
};

// スレッドURLから板URLを導出（types.ts の threadUrlToBoardUrl と同等）
function deriveBoardUrl(threadUrl: string): string {
  try {
    const url = new window.URL(threadUrl);
    const chMatch = url.pathname.match(/^\/test\/read\.cgi\/([^/]+)\//);
    if (chMatch) return `${url.origin}/${chMatch[1]}/`;
    const jbbsMatch = url.pathname.match(/^\/bbs\/read\.cgi\/([^/]+\/[^/]+)\//);
    if (jbbsMatch) return `${url.origin}/bbs/read.cgi/${jbbsMatch[1]}/`;
    const machiMatch = url.pathname.match(/^\/bbs\/read\.cgi\/([^/]+)\//);
    if (machiMatch) return `${url.origin}/${machiMatch[1]}/`;
  } catch {
    // パース不能
  }
  return threadUrl;
}
