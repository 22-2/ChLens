import { type ReactNode, useCallback, useMemo, useState } from "react";
import { createLogger } from "src/app/logger";
import { readBookmarkStatus } from "src/features/bookmark/browser/use-bookmark-revision";
import { useThreadTitleNgDialog } from "src/features/ng/browser/use-thread-title-ng-dialog";
import type { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import type { useTabViewRuntime } from "src/features/tabs/browser/use-tab-view-runtime";
import { createThreadContextMenuItems } from "src/features/thread/ui/thread-context-menu-items";
import { clearCachedThreadReadState } from "src/features/thread-list/ui/thread-list-cache";
import type { IThread } from "src/service-container/interfaces";
import type { CommandRequest } from "src/view/browser/commands/command-runtime";
import { runCommandRequest } from "src/view/browser/commands/command-runtime";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { deleteThreadLogAndHistory } from "src/view/browser/commands/thread-log-actions";
import { ContextMenuNavigationActions } from "src/view/browser/components/ContextMenuNavigationActions";
import {
  canGoBack,
  canGoForward,
  type Tab,
  type ThreadListPage as ThreadListPageType,
} from "src/view/browser/types";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";

const logger = createLogger("view/browser");

type TabViewRuntime = ReturnType<typeof useTabViewRuntime>;

interface ContextMenuState {
  x: number;
  y: number;
  thread: IThread;
}

interface UseThreadListContextMenuOptions {
  page: ThreadListPageType;
  navigationTab: Tab;
  viewSurface: TabViewRuntime["surface"];
  toast: TabViewRuntime["toast"];
  bookmarkRevision: number;
  runTabCommand: ReturnType<typeof useTabCommandRunner>;
  requestManualRefresh: () => void;
}

/**
 * スレ一覧の行を右クリックしたときのメニュー（スレのコマンド、スレタイNG登録、ログ削除、
 * 戻る・進む・更新）の状態と項目を組み立てる。
 */
export function useThreadListContextMenu({
  page,
  navigationTab,
  viewSurface,
  toast,
  bookmarkRevision,
  runTabCommand,
  requestManualRefresh,
}: UseThreadListContextMenuOptions) {
  const viewWindow = viewSurface.window;
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState | null>(null);
  const threadTitleNgDialog = useThreadTitleNgDialog({
    toast,
    logLabel: "ThreadListPage",
  });
  const { open: openThreadTitleNgDialog } = threadTitleNgDialog;

  const runTargetCommand = useCallback(
    (request: CommandRequest) => {
      void runCommandRequest(request, { surface: viewSurface, toast });
    },
    [toast, viewSurface],
  );

  const deleteThreadRecords = useCallback(
    async (thread: IThread) => {
      try {
        const deletedCount = await deleteThreadLogAndHistory(
          thread.url,
          clearCachedThreadReadState,
        );
        if (deletedCount === 0) {
          toast.info("このスレのログは保存されていません。閲覧履歴を削除しました", {
            targetWindow: viewWindow,
          });
          return;
        }
        toast.success("スレログと閲覧履歴を削除しました", { targetWindow: viewWindow });
      } catch (error) {
        logger.error("スレログと閲覧履歴の削除に失敗しました", { url: thread.url, error });
        toast.error("スレログと閲覧履歴を削除できませんでした", { targetWindow: viewWindow });
      }
    },
    [toast, viewWindow],
  );

  const openContextMenu = useCallback((thread: IThread, x: number, y: number) => {
    setContextMenuState({ x, y, thread });
  }, []);
  const closeContextMenu = useCallback(() => setContextMenuState(null), []);

  const contextMenuItems = useMemo(() => {
    if (!contextMenuState) return [];
    const { thread } = contextMenuState;
    // ブックマークの外部更新でもメニューの表示を取り直すため、revisionを依存値に含める。
    void bookmarkRevision;
    return createThreadContextMenuItems({
      target: { title: thread.title, url: thread.url },
      isBookmarked: readBookmarkStatus(thread.url),
      onRegisterTitleNg: () => openThreadTitleNgDialog(thread),
      runCommand: runTargetCommand,
      onDeleteThreadRecords: () => {
        void deleteThreadRecords(thread);
      },
    });
  }, [
    bookmarkRevision,
    contextMenuState,
    deleteThreadRecords,
    openThreadTitleNgDialog,
    runTargetCommand,
  ]);

  const contextMenuNavigationActions: ReactNode = contextMenuState ? (
    <ContextMenuNavigationActions
      canGoBack={canGoBack(navigationTab)}
      canGoForward={canGoForward(navigationTab)}
      canRefresh={isPageRefreshable(page)}
      onBack={() => {
        runTabCommand(TAB_COMMAND_IDS.BACK);
        closeContextMenu();
      }}
      onForward={() => {
        runTabCommand(TAB_COMMAND_IDS.FORWARD);
        closeContextMenu();
      }}
      onRefresh={() => {
        requestManualRefresh();
        closeContextMenu();
      }}
    />
  ) : null;

  return {
    contextMenuState,
    openContextMenu,
    closeContextMenu,
    contextMenuItems,
    contextMenuNavigationActions,
    threadTitleNgDialog,
  };
}
