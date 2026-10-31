import {
  Archive,
  Bookmark,
  Command,
  Filter,
  History,
  List as ListIcon,
  PenLine,
} from "lucide-react";
import { useMemo } from "react";
import { commandPalette } from "src/view/browser/commands/command-palette-store";
import {
  BOTTOM_PANEL_THREAD_LIST_TAB_ID,
  BOTTOM_PANEL_WRITE_TAB_ID,
  type useBottomPanel,
} from "src/view/browser/hooks/use-bottom-panel";
import type { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { createQuickAccessPage, type QuickAccessPage } from "src/view/browser/utils/tab-pages";

/** ナビゲーションバーのメニュー（コマンド・パネル・履歴などの項目）を組み立てる。 */
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
}) {
  const menuItems = useMemo(
    () => [
      {
        id: "open-command-palette",
        label: "コマンドパレット",
        icon: <Command size={14} />,
        onSelect: () => commandPalette.open("command"),
      },
      ...(canToggleFilter
        ? [
            {
              id: "open-filter-toolbar",
              label: "フィルター",
              icon: <Filter size={14} />,
              onSelect: toggleFilterFromMenu,
            },
          ]
        : []),
      ...(viewPage.type === "thread"
        ? [
            {
              id: "open-thread-list-panel",
              label:
                isPanelOpen && activePanelTabId === BOTTOM_PANEL_THREAD_LIST_TAB_ID
                  ? "スレ一覧パネルを閉じる"
                  : "スレ一覧パネル",
              icon: <ListIcon size={14} />,
              onSelect: () => togglePanel(BOTTOM_PANEL_THREAD_LIST_TAB_ID),
            },
          ]
        : []),
      ...(viewPage.type === "thread" && canWrite
        ? [
            {
              id: "open-write-panel",
              label:
                isPanelOpen && activePanelTabId === BOTTOM_PANEL_WRITE_TAB_ID
                  ? "書き込みパネルを閉じる"
                  : "書き込みパネル",
              icon: <PenLine size={14} />,
              onSelect: () => togglePanel(BOTTOM_PANEL_WRITE_TAB_ID),
            },
          ]
        : []),
      {
        id: "quick-access-separator",
        separator: true,
      },
      {
        id: "open-bookmark-list",
        label: "ブックマークリスト",
        icon: <Bookmark size={14} />,
        onSelect: () => openQuickAccessPage(createQuickAccessPage("bookmarkList")),
        onAuxSelect: (button: number) => {
          if (button !== 1) return;
          openQuickAccessPageInNewTab(createQuickAccessPage("bookmarkList"));
        },
      },
      {
        id: "open-history-list",
        label: "閲覧履歴",
        icon: <History size={14} />,
        onSelect: () => openQuickAccessPage(createQuickAccessPage("historyList")),
        onAuxSelect: (button: number) => {
          if (button !== 1) return;
          openQuickAccessPageInNewTab(createQuickAccessPage("historyList"));
        },
      },
      {
        id: "open-write-history-list",
        label: "書き込み履歴",
        icon: <PenLine size={14} />,
        onSelect: () => openQuickAccessPage(createQuickAccessPage("writeHistoryList")),
        onAuxSelect: (button: number) => {
          if (button !== 1) return;
          openQuickAccessPageInNewTab(createQuickAccessPage("writeHistoryList"));
        },
      },
      {
        id: "open-log-list",
        label: "ログ検索",
        icon: <Archive size={14} />,
        onSelect: () => openQuickAccessPage(createQuickAccessPage("logList")),
        onAuxSelect: (button: number) => {
          if (button !== 1) return;
          openQuickAccessPageInNewTab(createQuickAccessPage("logList"));
        },
      },
    ],
    [
      viewPage.type,
      canWrite,
      activePanelTabId,
      canToggleFilter,
      openQuickAccessPage,
      openQuickAccessPageInNewTab,
      toggleFilterFromMenu,
      isPanelOpen,
      togglePanel,
    ],
  );
  return menuItems;
}
