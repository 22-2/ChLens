import { commandPalette } from "src/view/browser/commands/command-palette-store";
import type { useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import type { QuickAccessPage } from "src/view/browser/utils/tab-pages";

import type { NavigationMenuAction } from "./navigation-menu";

export interface NavigationMenuDeps {
  toggleFilterFromMenu: () => void;
  togglePanel: ReturnType<typeof useBottomPanel>["togglePanel"];
  openQuickAccessPage: (page: QuickAccessPage) => void;
  openQuickAccessPageInNewTab: (page: QuickAccessPage) => void;
}

/** ナビゲーションメニューの操作を実行する。コマンドパレットや各種パネルへの作用はここに集める。 */
export function runNavigationMenuAction(
  action: NavigationMenuAction,
  deps: NavigationMenuDeps,
): void {
  switch (action.type) {
    case "open-command-palette":
      commandPalette.open("command");
      return;
    case "toggle-filter":
      deps.toggleFilterFromMenu();
      return;
    case "toggle-panel":
      deps.togglePanel(action.panelTabId);
      return;
    case "open-quick-access":
      if (action.inNewTab) {
        deps.openQuickAccessPageInNewTab(action.page);
      } else {
        deps.openQuickAccessPage(action.page);
      }
      return;
  }
}
