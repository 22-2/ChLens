import type { Dispatch } from "react";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { TabAction } from "src/view/browser/state/tabs/tab-store-types";
import { getCurrentPage, type Tab } from "src/view/browser/types";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";

/** 履歴はストアが保持する、閉じた順の新しい順に表示する。 */
export function closedTabMenuItems(
  tabs: readonly Tab[],
  dispatch: Dispatch<TabAction>,
): ContextMenuItem[] {
  return tabs.map((tab, index) => ({
    id: `closed-tab-${index}`,
    label: getCurrentPage(tab).title,
    onSelect: () => dispatch(tabActions.reopenClosedTab(tab.id)),
  }));
}
