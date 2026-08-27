import {
  Bookmark,
  BookmarkX,
  Clipboard,
  ExternalLink,
  List,
  PanelRight,
  Pin,
  PinOff,
  X,
} from "lucide-react";
import React, { useMemo } from "react";
import { container } from "src/service-container";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";
import { ContextMenu, ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";
import { copyText, formatMarkdownLink } from "src/view/browser/utils/utils";
// `app.bookmark` はグローバルで提供されるサービス

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
  const hasRightClosable = state.tabs.slice(tabIndex + 1).some((t) => !t.pinned);
  // 閉じたタブがあるか
  const hasClosedTabs = state.closedTabs.length > 0;

  const items = useMemo(() => {
    const result: ContextMenuItem[] = [
      {
        id: "close",
        label: "タブを閉じる",
        disabled: tab.pinned,
        icon: <X />,
        onSelect: () => dispatch({ type: "CLOSE_TAB", tabId: tab.id }),
      },
      {
        id: "close-others",
        label: "他のタブを閉じる",
        disabled: !hasOtherClosable,
        icon: <X />,
        onSelect: () => dispatch({ type: "CLOSE_OTHER_TABS", tabId: tab.id }),
      },
      {
        id: "close-right",
        label: "右側のタブを閉じる",
        disabled: !hasRightClosable,
        icon: <X />,
        onSelect: () => dispatch({ type: "CLOSE_RIGHT_TABS", tabId: tab.id }),
      },
      {
        id: "close-all",
        label: "すべて閉じる",
        icon: <X />,
        onSelect: () => dispatch({ type: "CLOSE_ALL_TABS" }),
      },
      {
        id: "reopen",
        label: "閉じたタブを開く",
        disabled: !hasClosedTabs,
        icon: <ExternalLink />,
        onSelect: () => dispatch({ type: "REOPEN_CLOSED_TAB" }),
      },
      { id: "sep-1", separator: true },
      {
        id: "open-in-right-pane",
        label: "右のペインで開く",
        icon: <PanelRight />,
        onSelect: () => dispatch({ type: "OPEN_IN_RIGHT_PANE", tabId: tab.id }),
      },
      { id: "sep-pane", separator: true },
    ];

    if (isThread) {
      const threadPage = currentPage as { threadUrl: string; title: string };
      const boardUrl = deriveBoardUrl(threadPage.threadUrl);
      const isBookmarked = container.bookmark?.get(threadPage.threadUrl);
      result.push({
        id: "bookmark",
        label: isBookmarked ? "ブックマークを削除" : "ブックマークに追加",
        icon: isBookmarked ? <BookmarkX /> : <Bookmark />,
        onSelect: () => {
          try {
            if (isBookmarked) {
              container.bookmark.remove(threadPage.threadUrl);
            } else {
              container.bookmark.add({
                url: threadPage.threadUrl,
                title: threadPage.title,
                type: "thread",
              });
            }
          } catch (e) {
            console.error("Bookmark operation failed", e);
            // TODO: 共通のNoticeみたいなのがほしいな
          }
        },
      });
      result.push({
        id: "copy-title",
        label: "スレタイをコピー",
        icon: <Clipboard />,
        onSelect: () => {
          void copyText(threadPage.title);
        },
      });
      result.push({
        id: "copy-url",
        label: "URLをコピー",
        // 変更理由: タブ単位の操作でも、タイトルを付けずに通常のスレURLだけを取得できるようにする。
        onSelect: () => {
          void copyText(threadPage.threadUrl);
        },
      });
      result.push({
        id: "copy-title-url",
        label: "スレタイ&URLをコピー",
        icon: <Clipboard />,
        onSelect: () => {
          void copyText(`${threadPage.title}\n${threadPage.threadUrl}`);
        },
      });
      result.push({
        id: "copy-title-url-markdown",
        label: "スレタイ&URLをMarkdownでコピー",
        // 変更理由: 改行形式を維持したまま、Markdownリンクを必要とする利用者にも同じメニューから提供する。
        onSelect: () => {
          void copyText(formatMarkdownLink(threadPage.title, threadPage.threadUrl));
        },
      });
      result.push({ id: "sep-copy", separator: true });
      result.push({
        id: "to-board",
        label: "板を開く",
        icon: <List />,
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
      result.push({
        id: "open-in-browser",
        label: "ブラウザで開く",
        icon: <ExternalLink />,
        onSelect: () => {
          window.open(threadPage.threadUrl, "_blank", "noopener,noreferrer");
        },
      });
      result.push({ id: "sep-2", separator: true });
    }

    result.push({
      id: "pin",
      label: tab.pinned ? "タブの固定を解除" : "タブを固定",
      icon: tab.pinned ? <PinOff /> : <Pin />,
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

  return <ContextMenu x={position.x} y={position.y} items={items} onClose={onClose} />;
};

// スレッドURLから板URLを導出（types.ts の threadUrlToBoardUrl と同等）
function deriveBoardUrl(threadUrl: string): string {
  // 変更理由: コンテキストメニューだけ判定がズレると「板を開く」の遷移先が不一致になる。
  return getBoardUrlFromThreadUrl(threadUrl);
}
