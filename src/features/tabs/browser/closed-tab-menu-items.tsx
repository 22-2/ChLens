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
    // 履歴は残し、通常のページ遷移と同じく現在のタブで開く。
    onSelect: () => dispatch(tabActions.navigate(getCurrentPage(tab))),
    // 同じページが既に開いていても、明示された背景タブとして追加する。
    onAuxSelect: (button) => {
      if (button === 1) dispatch(tabActions.openInNewTabForce(getCurrentPage(tab)));
    },
  }));
}
