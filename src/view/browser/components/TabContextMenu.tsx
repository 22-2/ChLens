import React, { useMemo } from "react";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";

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

  const tabIndex = state.tabs.findIndex((t) => t.id === tab.id);
  const currentPage = getCurrentPage(tab);
  const isThread = currentPage.type === "thread";

  // 他のタブ（固定タブ除く、自分除く）が存在するか
  const hasOtherClosable = state.tabs.some((t) => t.id !== tab.id && !t.pinned);
  // 右側に閉じられるタブがあるか
  const hasRightClosable = state.tabs
    .slice(tabIndex + 1)
    .some((t) => !t.pinned);
  // 閉じたタブがあるか
  const hasClosedTabs = state.closedTabs.length > 0;

  const items = useMemo(() => {
    const result = [
      {
        id: "close",
        label: "タブを閉じる",
        disabled: tab.pinned,
        onSelect: () => dispatch({ type: "CLOSE_TAB", tabId: tab.id }),
      },
      {
        id: "close-others",
        label: "他のタブを閉じる",
        disabled: !hasOtherClosable,
        onSelect: () => dispatch({ type: "CLOSE_OTHER_TABS", tabId: tab.id }),
      },
      {
        id: "close-right",
        label: "右側のタブを閉じる",
        disabled: !hasRightClosable,
        onSelect: () => dispatch({ type: "CLOSE_RIGHT_TABS", tabId: tab.id }),
      },
      {
        id: "reopen",
        label: "閉じたタブを開く",
        disabled: !hasClosedTabs,
        onSelect: () => dispatch({ type: "REOPEN_CLOSED_TAB" }),
      },
      {
        id: "close-all",
        label: "すべて閉じる",
        onSelect: () => dispatch({ type: "CLOSE_ALL_TABS" }),
      },
      { id: "sep-1", separator: true },
    ];

    if (isThread) {
      const threadPage = currentPage as { threadUrl: string };
      const boardUrl = deriveBoardUrl(threadPage.threadUrl);
      result.push({
        id: "to-board",
        label: "板を開く",
        onSelect: () => {
          // 元スレの履歴を残したまま板を見比べられるように、新しいタブで開く。
          dispatch({ type: "ADD_TAB" });
          dispatch({
            type: "NAVIGATE",
            page: {
              type: "threadList",
              title: boardUrl,
              boardUrl,
              boardTitle: boardUrl,
            },
          });
        },
      });
      result.push({ id: "sep-2", separator: true });
    }

    result.push({
      id: "pin",
      label: tab.pinned ? "タブの固定を解除" : "タブを固定",
      onSelect: () => dispatch({ type: "TOGGLE_PIN", tabId: tab.id }),
    });
    return result;
  }, [
    currentPage,
    dispatch,
    hasClosedTabs,
    hasOtherClosable,
    hasRightClosable,
    isThread,
    tab.id,
    tab.pinned,
  ]);

  return (
    <ContextMenu
      x={position.x}
      y={position.y}
      items={items}
      onClose={onClose}
    />
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
