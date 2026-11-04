import { ExternalLink, List, MoveRight, Pin, PinOff, RotateCcw, Trash2, X } from "lucide-react";
import React, { useCallback, useMemo } from "react";
import {
  readBookmarkStatus,
  useBookmarkRevision,
} from "src/features/bookmark/browser/use-bookmark-revision";
import { useDetachedTabController } from "src/features/tabs/browser/use-detached-tab-controller";
import { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import {
  createThreadBookmarkMenuItem,
  createThreadCopyMenuItems,
} from "src/features/thread/ui/thread-context-menu-items";
import { clearCachedThreadReadState } from "src/features/thread-list/ui/thread-list-cache";
import type { CommandRequest } from "src/view/browser/commands/command-runtime";
import { runCommandRequest } from "src/view/browser/commands/command-runtime";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { deleteThreadLogAndCloseTab } from "src/view/browser/commands/thread-log-actions";
import { useOptionalBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { listTabMoveDestinations } from "src/view/browser/state/tabs/tab-store-selectors";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { useWindowId } from "src/view/browser/state/tabs/use-window-scope";
import { MAIN_WINDOW_ID } from "src/view/browser/state/tabs/window-model";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";
import { ContextMenu, ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";
import { createBoardPage } from "src/view/browser/utils/tab-pages";

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
  const { state, dispatch, stateRef } = useTabStore();
  const runTabCommand = useTabCommandRunner(tab.id);
  const { detachTab, reattachTab } = useDetachedTabController();
  const bottomPanel = useOptionalBottomPanel();
  const toast = useToast();
  const viewSurface = useViewSurface();
  const { window: viewWindow } = viewSurface;
  const bookmarkRevision = useBookmarkRevision();
  const runTargetCommand = useCallback(
    (request: CommandRequest) => {
      void runCommandRequest(request, { surface: viewSurface, toast });
    },
    [toast, viewSurface],
  );

  const currentPage = getCurrentPage(tab);
  const isThread = currentPage.type === "thread";
  const tabIsDetached = useWindowId() !== MAIN_WINDOW_ID;

  // 閉じたタブがあるか
  const hasClosedTabs = state.closedTabs.length > 0;

  const items = useMemo(() => {
    // 移動先は、メニューを開いた時点のストア全体から求める。
    const allDestinations = stateRef?.current
      ? listTabMoveDestinations(stateRef.current, tab.id)
      : [];
    const mainDestinations = allDestinations.filter(
      (destination) => destination.windowId === MAIN_WINDOW_ID,
    );
    // 変更理由: 別窓のタブは「メイン画面へ戻す」が元のペインへ戻すので、
    // 本窓のペインが1つだけなら同じ操作を重ねて出さない。
    const moveDestinations =
      tabIsDetached && mainDestinations.length === 1
        ? allDestinations.filter((destination) => destination.windowId !== MAIN_WINDOW_ID)
        : allDestinations;
    const result: ContextMenuItem[] = [
      {
        id: "close",
        label: "タブを閉じる",
        // ホームを含む通常タブは共通の終了規則に従う。
        disabled: tab.pinned,
        icon: <X />,
        onSelect: () => runTabCommand(TAB_COMMAND_IDS.CLOSE),
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

    // 変更理由: 他・右側・すべてのタブを閉じる操作は、タブ固有のメニューから分離して
    // コマンドパレットへ集約する。スレッド固有のブックマーク・コピーだけは一覧メニュー
    // と同じ共通定義を使い、表示場所による操作差をなくす。

    // 変更理由: ページ種別で別窓可否を分けず、どのタブも同じメニューで切り離せるようにする。
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
        if (opened) {
          bottomPanel?.closePanel();
        } else {
          // ログだけでは操作結果が分からないため、利用者へも失敗理由を伝える。
          toast.error("別窓を開けませんでした。ポップアップ設定を確認してください");
        }
      },
    });
    result.push({ id: "sep-detach", separator: true });

    for (const destination of moveDestinations) {
      result.push({
        id: `move-to-${destination.paneId}`,
        label: destination.label,
        icon: <MoveRight />,
        onSelect: () =>
          runTabCommand(TAB_COMMAND_IDS.MOVE, {
            destination: { windowId: destination.windowId, paneId: destination.paneId },
          }),
      });
    }
    if (moveDestinations.length > 0) {
      result.push({ id: "sep-move", separator: true });
    }

    if (isThread) {
      const threadPage = currentPage as { threadUrl: string; title: string };
      const boardUrl = deriveBoardUrl(threadPage.threadUrl);
      // ブックマーク更新通知だけでもメニューのラベルを再生成するため、revisionを参照する。
      void bookmarkRevision;
      result.push(
        createThreadBookmarkMenuItem({
          target: { title: threadPage.title, url: threadPage.threadUrl },
          isBookmarked: readBookmarkStatus(threadPage.threadUrl),
          runCommand: runTargetCommand,
        }),
      );
      result.push(
        ...createThreadCopyMenuItems(
          { title: threadPage.title, url: threadPage.threadUrl },
          runTargetCommand,
        ),
      );
      result.push({ id: "sep-copy", separator: true });
      result.push({
        id: "to-board",
        label: "板を開く",
        icon: <List />,
        onSelect: () => {
          // 元スレの履歴を残したまま板を見比べられるように、新しいタブで開く。
          // 既存の同一板タブがあっても比較用の新規タブを作るため、重複排除を無効にする。
          dispatch(tabActions.openInNewTabForce(createBoardPage(boardUrl), { focus: true }));
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
      result.push({
        id: "delete-thread-log",
        label: "スレログと閲覧履歴を削除してタブを閉じる",
        icon: <Trash2 />,
        danger: true,
        disabled: tab.pinned,
        onSelect: () => {
          void deleteThreadLogAndCloseTab({
            threadUrl: threadPage.threadUrl,
            closeTab: () => runTabCommand(TAB_COMMAND_IDS.CLOSE),
            clearCachedReadState: clearCachedThreadReadState,
            toast,
          });
        },
      });
      result.push({ id: "sep-2", separator: true });
    }

    result.push({
      id: "pin",
      label: tab.pinned ? "タブの固定を解除" : "タブを固定",
      icon: tab.pinned ? <PinOff /> : <Pin />,
      onSelect: () =>
        runTabCommand(TAB_COMMAND_IDS.PIN_SET, {
          pinned: !tab.pinned,
        }),
    });
    return result;
  }, [
    currentPage,
    dispatch,
    hasClosedTabs,
    bookmarkRevision,
    tabIsDetached,
    isThread,
    stateRef,
    bottomPanel,
    toast,
    viewWindow,
    tab.id,
    tab.pinned,
    detachTab,
    reattachTab,
    runTargetCommand,
    runTabCommand,
  ]);

  return <ContextMenu x={position.x} y={position.y} items={items} onClose={onClose} />;
};

// スレッドURLから板URLを導出（types.ts の threadUrlToBoardUrl と同等）
function deriveBoardUrl(threadUrl: string): string {
  // 変更理由: コンテキストメニューだけ判定がズレると「板を開く」の遷移先が不一致になる。
  return getBoardUrlFromThreadUrl(threadUrl);
}
