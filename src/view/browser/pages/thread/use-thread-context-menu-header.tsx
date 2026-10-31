import { useCallback } from "react";
import type { ContextMenuPopupItem } from "src/features/popup/browser/popup-types";
import type { useThreadPopupManager } from "src/features/popup/browser/use-popup-manager";
import type { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { ContextMenuNavigationActions } from "src/view/browser/components/ContextMenuNavigationActions";
import {
  canGoBack,
  canGoForward,
  type Tab,
  type ThreadPage as ThreadPageType,
} from "src/view/browser/types";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";

/** ポップアップのレスメニューの先頭に、戻る・進む・再読み込みの操作を出す。 */
export function useThreadContextMenuHeader({
  navigationTab,
  page,
  canRefresh,
  requestManualRefresh,
  runTabCommand,
  closePopupById,
}: {
  navigationTab: Tab;
  page: ThreadPageType;
  canRefresh: boolean;
  requestManualRefresh: () => void;
  runTabCommand: ReturnType<typeof useTabCommandRunner>;
  closePopupById: ReturnType<typeof useThreadPopupManager>["closePopupById"];
}) {
  const contextMenuHeader = useCallback(
    (menu: ContextMenuPopupItem) => (
      // 変更理由: ポップアップのレスメニューはそれぞれ独立したpopupとして管理されるため、
      // 操作後に対象メニューだけを閉じて、他の固定ポップアップを維持する。
      <ContextMenuNavigationActions
        canGoBack={canGoBack(navigationTab)}
        canGoForward={canGoForward(navigationTab)}
        canRefresh={canRefresh && isPageRefreshable(page)}
        onBack={() => {
          runTabCommand(TAB_COMMAND_IDS.BACK);
          closePopupById(menu.id);
        }}
        onForward={() => {
          runTabCommand(TAB_COMMAND_IDS.FORWARD);
          closePopupById(menu.id);
        }}
        onRefresh={() => {
          requestManualRefresh();
          closePopupById(menu.id);
        }}
      />
    ),
    [closePopupById, navigationTab, page, requestManualRefresh, runTabCommand, canRefresh],
  );
  return contextMenuHeader;
}
