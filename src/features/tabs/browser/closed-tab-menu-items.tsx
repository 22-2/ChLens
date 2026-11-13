import { History } from "lucide-react";
import type { Dispatch } from "react";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { TabAction } from "src/view/browser/state/tabs/tab-store-types";
import { getCurrentPage, type Tab } from "src/view/browser/types";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";

/** 復元先を選べるよう、保持している閉じたタブをすべてサブメニュー項目にする。 */
export function closedTabMenuItems(
  tabs: readonly Tab[],
  dispatch: Dispatch<TabAction>,
): ContextMenuItem[] {
  return tabs.map((tab) => ({
    id: `closed-tab-${tab.id}`,
    label: getCurrentPage(tab).title,
    icon: <History size={14} />,
    onSelect: () => dispatch(tabActions.reopenClosedTab(tab.id)),
  }));
}
