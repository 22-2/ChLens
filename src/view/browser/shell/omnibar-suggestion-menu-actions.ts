import type { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import { clearCachedThreadReadState } from "src/features/thread-list/ui/thread-list-cache";
import { runCommandRequest } from "src/view/browser/commands/command-runtime";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { deleteThreadLogAndCloseTab } from "src/view/browser/commands/thread-log-actions";
import type { useToast } from "src/view/browser/hooks/use-toast";
import type { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import type { OmnibarSuggestion } from "src/view/browser/utils/omnibar";

import type { OmnibarSuggestionMenuAction } from "./omnibar-suggestion-menu";

export interface OmnibarSuggestionMenuDeps {
  openSuggestion: (suggestion: OmnibarSuggestion) => void;
  dispatch: ReturnType<typeof useTabStore>["dispatch"];
  runTabCommand: ReturnType<typeof useTabCommandRunner>;
  toast: ReturnType<typeof useToast>;
  viewSurface: ReturnType<typeof useViewSurface>;
}

function closeTabs(
  tabIds: readonly string[],
  runTabCommand: ReturnType<typeof useTabCommandRunner>,
): boolean {
  let didCloseTab = false;
  for (const tabId of tabIds) {
    didCloseTab = runTabCommand(TAB_COMMAND_IDS.CLOSE, { tabId }) || didCloseTab;
  }
  return didCloseTab;
}

/** 候補メニューの操作を実行する。ブラウザ・タブ・コマンドへの作用はここに集める。 */
export function runOmnibarSuggestionMenuAction(
  action: OmnibarSuggestionMenuAction,
  deps: OmnibarSuggestionMenuDeps,
): void {
  switch (action.type) {
    case "open-current":
      deps.openSuggestion(action.suggestion);
      return;
    case "open-new-tab":
      deps.dispatch(tabActions.openInNewTabForce(action.page, { focus: true }));
      return;
    case "run-command":
      void runCommandRequest(action.request, { surface: deps.viewSurface, toast: deps.toast });
      return;
    case "delete-thread-log":
      void deleteThreadLogAndCloseTab({
        threadUrl: action.threadUrl,
        closeTab: () => closeTabs(action.tabIds, deps.runTabCommand),
        clearCachedReadState: clearCachedThreadReadState,
        toast: deps.toast,
      });
      return;
    case "open-in-browser":
      deps.viewSurface.window.open(action.url, "_blank", "noopener,noreferrer");
      return;
  }
}
