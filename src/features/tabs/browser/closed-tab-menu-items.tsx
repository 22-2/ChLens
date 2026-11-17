import { Clipboard, ExternalLink, History } from "lucide-react";
import type { Dispatch } from "react";
import { getDisplayUrl } from "src/view/browser/page-type-definitions";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { TabAction } from "src/view/browser/state/tabs/tab-store-types";
import { getCurrentPage, type Tab } from "src/view/browser/types";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";

/** 復元先を選べるよう、保持している閉じたタブをすべてサブメニュー項目にする。 */
export function closedTabMenuItems(
  tabs: readonly Tab[],
  dispatch: Dispatch<TabAction>,
  copy: (text: string) => void,
): ContextMenuItem[] {
  return tabs.map((tab) => {
    const page = getCurrentPage(tab);
    const url = page.type === "thread" || page.type === "threadList" ? getDisplayUrl(page) : null;
    return {
      id: `closed-tab-${tab.id}`,
      label: getCurrentPage(tab).title,
      icon: <History size={14} />,
      // 履歴は残し、通常のページ遷移と同じく現在のタブで開く。
      onSelect: () => dispatch(tabActions.navigate(getCurrentPage(tab))),
      // 同じページが既に開いていても、明示された背景タブとして追加する。
      onAuxSelect: (button) => {
        if (button === 1) dispatch(tabActions.openInNewTabForce(getCurrentPage(tab)));
      },
      contextItems: [
        {
          id: "open-current",
          label: "現在のタブで開く",
          icon: <ExternalLink size={14} />,
          onSelect: () => dispatch(tabActions.navigate(page)),
        },
        {
          id: "open-new",
          label: "新しいタブで開く",
          icon: <ExternalLink size={14} />,
          onSelect: () => dispatch(tabActions.openInNewTabForce(page, { focus: true })),
        },
        // 開く操作とコピー操作の境界を分かりやすくする。
        { id: "open-copy-separator", separator: true },
        {
          id: "copy-title",
          label: "タイトルをコピー",
          icon: <Clipboard size={14} />,
          onSelect: () => copy(page.title),
        },
        ...(url
          ? [
              {
                id: "copy-url",
                label: "URLをコピー",
                icon: <Clipboard size={14} />,
                onSelect: () => copy(url),
              },
              {
                id: "copy-title-url",
                label: "タイトルとURLをコピー",
                icon: <Clipboard size={14} />,
                onSelect: () => copy(`${page.title}\n${url}`),
              },
            ]
          : []),
      ],
    };
  });
}
