import { History } from "lucide-react";
import type { Dispatch } from "react";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { TabAction } from "src/view/browser/state/tabs/tab-store-types";
import { getCurrentPage, type Tab } from "src/view/browser/types";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";

const MAX_CLOSED_TAB_MENU_ITEMS = 5;

/**
 * メニューが長くなりすぎないよう、履歴の新しい５件だけを表示する。
 * 変更理由: アイコンなしだと「閉じたタブを開く」など操作項目と左端が揃わず、
 * 履歴なのか操作なのか区別しづらいため、前後を区切り線で分けて履歴アイコンを付ける。
 * 履歴が空のときは区切り線も出さない。
 */
export function closedTabMenuItems(
  tabs: readonly Tab[],
  dispatch: Dispatch<TabAction>,
): ContextMenuItem[] {
  const recent = tabs.slice(0, MAX_CLOSED_TAB_MENU_ITEMS);
  if (recent.length === 0) return [];
  return [
    { id: "closed-tabs-sep-start", separator: true },
    ...recent.map((tab, index) => ({
      id: `closed-tab-${index}`,
      label: getCurrentPage(tab).title,
      icon: <History />,
      onSelect: () => dispatch(tabActions.reopenClosedTab(tab.id)),
    })),
  ];
}
