import {
  Archive,
  Bookmark,
  Command,
  Filter,
  History,
  Info,
  List as ListIcon,
  type LucideIcon,
  PenLine,
} from "lucide-react";
import {
  BOTTOM_PANEL_THREAD_LIST_TAB_ID,
  BOTTOM_PANEL_WRITE_TAB_ID,
  type useBottomPanel,
} from "src/view/browser/hooks/use-bottom-panel";
import type { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { createQuickAccessPage, type QuickAccessPage } from "src/view/browser/utils/tab-pages";

/**
 * ナビゲーションメニューの項目が「何をするか」を表すデータ。
 * 組み立て（buildNavigationMenuEntries）は副作用を持たず、実行は navigation-menu-actions が行う。
 */
export type NavigationMenuAction =
  | { type: "open-command-palette" }
  | { type: "toggle-filter" }
  | { type: "toggle-panel"; panelTabId: string }
  | { type: "open-quick-access"; page: QuickAccessPage; inNewTab: boolean };

export type NavigationMenuEntry =
  | { id: string; separator: true }
  | {
      id: string;
      label: string;
      icon: LucideIcon;
      action: NavigationMenuAction;
      /** 中クリック（button 1）で実行する操作。対応しない項目では未指定にする。 */
      middleClickAction?: NavigationMenuAction;
    };

export interface NavigationMenuInput {
  viewPage: ReturnType<typeof useTabStore>["viewPage"];
  canWrite: boolean;
  canToggleFilter: boolean;
  isPanelOpen: boolean;
  activePanelTabId: ReturnType<typeof useBottomPanel>["activePanelTabId"];
}

function quickAccessEntry(
  id: string,
  label: string,
  icon: LucideIcon,
  page: QuickAccessPage,
): NavigationMenuEntry {
  return {
    id,
    label,
    icon,
    action: { type: "open-quick-access", page, inNewTab: false },
    middleClickAction: { type: "open-quick-access", page, inNewTab: true },
  };
}

/** ナビゲーションバーのメニュー（コマンド・パネル・履歴などの項目）を、画面の状態から組み立てる。副作用は持たない。 */
export function buildNavigationMenuEntries({
  viewPage,
  canWrite,
  canToggleFilter,
  isPanelOpen,
  activePanelTabId,
}: NavigationMenuInput): NavigationMenuEntry[] {
  const isPanelActive = (panelTabId: string) => isPanelOpen && activePanelTabId === panelTabId;
  const isThreadPage = viewPage.type === "thread";
  const entries: NavigationMenuEntry[] = [
    {
      id: "open-command-palette",
      label: "コマンドパレット",
      icon: Command,
      action: { type: "open-command-palette" },
    },
  ];

  if (canToggleFilter) {
    entries.push({
      id: "open-filter-toolbar",
      label: "フィルター",
      icon: Filter,
      action: { type: "toggle-filter" },
    });
  }

  if (isThreadPage) {
    entries.push({
      id: "open-thread-list-panel",
      label: isPanelActive(BOTTOM_PANEL_THREAD_LIST_TAB_ID)
        ? "スレ一覧パネルを閉じる"
        : "スレ一覧パネル",
      icon: ListIcon,
      action: { type: "toggle-panel", panelTabId: BOTTOM_PANEL_THREAD_LIST_TAB_ID },
    });
  }

  if (isThreadPage && canWrite) {
    entries.push({
      id: "open-write-panel",
      label: isPanelActive(BOTTOM_PANEL_WRITE_TAB_ID) ? "書き込みパネルを閉じる" : "書き込みパネル",
      icon: PenLine,
      action: { type: "toggle-panel", panelTabId: BOTTOM_PANEL_WRITE_TAB_ID },
    });
  }

  entries.push(
    { id: "quick-access-separator", separator: true },
    quickAccessEntry(
      "open-bookmark-list",
      "ブックマークリスト",
      Bookmark,
      createQuickAccessPage("bookmarkList"),
    ),
    quickAccessEntry(
      "open-history-list",
      "閲覧履歴",
      History,
      createQuickAccessPage("historyList"),
    ),
    quickAccessEntry(
      "open-write-history-list",
      "書き込み履歴",
      PenLine,
      createQuickAccessPage("writeHistoryList"),
    ),
    quickAccessEntry("open-log-list", "ログ検索", Archive, createQuickAccessPage("logList")),
    // アプリの情報は履歴や検索とは別の用途なので、区切りを挟んでメニューの最下段に置く。
    { id: "about-separator", separator: true },
    quickAccessEntry("open-about", "ChLensについて", Info, createQuickAccessPage("about")),
  );
  return entries;
}
