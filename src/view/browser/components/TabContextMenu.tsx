import {
  Bookmark,
  BookmarkX,
  Clipboard,
  ExternalLink,
  List,
  Pin,
  PinOff,
  RotateCcw,
  X,
} from "lucide-react";
import React, { useMemo } from "react";
import { container } from "src/service-container";
import { tabActions } from "src/view/browser/hooks/tab-store-actions";
import { useOptionalBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useDetachedTabController } from "src/view/browser/hooks/use-detached-tab-controller";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";
import { ContextMenu, ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { copyText } from "src/view/browser/utils/clipboard";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";
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
  const { isDetachedTab, detachTab, reattachTab } = useDetachedTabController();
  const bottomPanel = useOptionalBottomPanel();
  const toast = useToast();
  const { window: viewWindow } = useViewSurface();

  const currentPage = getCurrentPage(tab);
  const isThread = currentPage.type === "thread";
  const isThreadList = currentPage.type === "threadList";
  const tabIsDetached = isDetachedTab(tab.id);
  const canDetach = isThread || isThreadList || tabIsDetached;

  // 閉じたタブがあるか
  const hasClosedTabs = state.closedTabs.length > 0;

  const items = useMemo(() => {
    const result: ContextMenuItem[] = [
      {
        id: "close",
        label: "タブを閉じる",
        disabled: tab.pinned,
        icon: <X />,
        onSelect: () => dispatch(tabActions.closeTab(tab.id)),
      },
      {
        id: "reopen",
        label: "閉じたタブを開く",
        disabled: !hasClosedTabs,
        // 変更理由: 外部ブラウザで開く操作と混同しないよう、タブ復元らしい巻き戻しアイコンにする。
        icon: <RotateCcw />,
        onSelect: () => dispatch(tabActions.reopenClosedTab()),
      },
      { id: "sep-1", separator: true },
    ];

    // 変更理由: 他・右側・すべてのタブを閉じる、右ペインで開く、URLとMarkdownのコピーは
    // コマンドパレットへ移動したため、タブメニューには置かない。URL系は既存の
    // copy.page-url / copy.page-title-url-markdown コマンドが同等の操作を提供する。

    if (canDetach) {
      result.push({
        id: "detach-tab",
        label: tabIsDetached ? "メイン画面へ戻す" : "別窓で開く",
        icon: <ExternalLink />,
        onSelect: () => {
          if (tabIsDetached) {
            reattachTab(tab.id);
            return;
          }

          const opened = detachTab(tab.id);
          // 窓の生成に成功した時だけ同じペインの下部パネルを閉じ、
          // ポップアップブロック時は入力中のパネルを残す。
          if (!tabIsDetached && opened) {
            bottomPanel?.closePanel();
          } else if (!tabIsDetached && !opened) {
            // ログだけでは操作結果が分からないため、利用者へも失敗理由を伝える。
            toast.error("別窓を開けませんでした。ポップアップ設定を確認してください");
          }
        },
      });
      result.push({ id: "sep-detach", separator: true });
    }

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
        id: "copy-title-url",
        label: "スレタイ&URLをコピー",
        icon: <Clipboard />,
        onSelect: () => {
          void copyText(`${threadPage.title}\n${threadPage.threadUrl}`);
        },
      });
      result.push({ id: "sep-copy", separator: true });
      result.push({
        id: "to-board",
        label: "板を開く",
        icon: <List />,
        onSelect: () => {
          // 元スレの履歴を残したまま板を見比べられるように、新しいタブで開く。
          dispatch(tabActions.addTab());
          dispatch(
            tabActions.navigate({
              type: "threadList",
              title: boardUrl,
              boardUrl,
              boardTitle: boardUrl,
            }),
          );
        },
      });
      result.push({
        id: "open-in-browser",
        label: "ブラウザで開く",
        icon: <ExternalLink />,
        onSelect: () => {
          // 別窓のタブから実行しても、その窓を起点に外部ページを開く。
          viewWindow.open(threadPage.threadUrl, "_blank", "noopener,noreferrer");
        },
      });
      result.push({ id: "sep-2", separator: true });
    }

    result.push({
      id: "pin",
      label: tab.pinned ? "タブの固定を解除" : "タブを固定",
      icon: tab.pinned ? <PinOff /> : <Pin />,
      onSelect: () => dispatch(tabActions.togglePin(tab.id)),
    });
    return result;
  }, [
    canDetach,
    currentPage,
    dispatch,
    hasClosedTabs,
    tabIsDetached,
    isThread,
    bottomPanel,
    toast,
    viewWindow,
    tab.id,
    tab.pinned,
    detachTab,
    reattachTab,
  ]);

  return <ContextMenu x={position.x} y={position.y} items={items} onClose={onClose} />;
};

// スレッドURLから板URLを導出（types.ts の threadUrlToBoardUrl と同等）
function deriveBoardUrl(threadUrl: string): string {
  // 変更理由: コンテキストメニューだけ判定がズレると「板を開く」の遷移先が不一致になる。
  return getBoardUrlFromThreadUrl(threadUrl);
}
