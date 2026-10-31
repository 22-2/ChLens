import { useMemo } from "react";
import type { useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import type { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import type { QuickAccessPage } from "src/view/browser/utils/tab-pages";

import { buildNavigationMenuEntries, type NavigationMenuEntry } from "./navigation-menu";
import { type NavigationMenuDeps, runNavigationMenuAction } from "./navigation-menu-actions";

const MIDDLE_MOUSE_BUTTON = 1;

function toContextMenuItem(entry: NavigationMenuEntry, deps: NavigationMenuDeps): ContextMenuItem {
  if ("separator" in entry) return { id: entry.id, separator: true };

  const { icon: Icon, action, middleClickAction, ...item } = entry;
  return {
    ...item,
    icon: <Icon size={14} />,
    onSelect: () => runNavigationMenuAction(action, deps),
    ...(middleClickAction && {
      onAuxSelect: (button: number) => {
        if (button !== MIDDLE_MOUSE_BUTTON) return;
        runNavigationMenuAction(middleClickAction, deps);
      },
    }),
  };
}

/** ナビゲーションバーのメニュー（コマンド・パネル・履歴などの項目）を返す。項目の組み立てと実行は別モジュールに分けている。 */
export function useNavigationMenuItems({
  viewPage,
  canWrite,
  canToggleFilter,
  toggleFilterFromMenu,
  isPanelOpen,
  activePanelTabId,
  togglePanel,
  openQuickAccessPage,
  openQuickAccessPageInNewTab,
}: {
  viewPage: ReturnType<typeof useTabStore>["viewPage"];
  canWrite: boolean;
  canToggleFilter: boolean;
  toggleFilterFromMenu: () => void;
  isPanelOpen: boolean;
  activePanelTabId: ReturnType<typeof useBottomPanel>["activePanelTabId"];
  togglePanel: ReturnType<typeof useBottomPanel>["togglePanel"];
  openQuickAccessPage: (page: QuickAccessPage) => void;
  openQuickAccessPageInNewTab: (page: QuickAccessPage) => void;
}): ContextMenuItem[] {
  return useMemo<ContextMenuItem[]>(() => {
    const deps: NavigationMenuDeps = {
      toggleFilterFromMenu,
      togglePanel,
      openQuickAccessPage,
      openQuickAccessPageInNewTab,
    };
    return buildNavigationMenuEntries({
      viewPage,
      canWrite,
      canToggleFilter,
      isPanelOpen,
      activePanelTabId,
    }).map((entry) => toContextMenuItem(entry, deps));
  }, [
    viewPage,
    canWrite,
    canToggleFilter,
    toggleFilterFromMenu,
    isPanelOpen,
    activePanelTabId,
    togglePanel,
    openQuickAccessPage,
    openQuickAccessPageInNewTab,
  ]);
}
