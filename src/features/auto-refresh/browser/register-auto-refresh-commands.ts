import { Timer } from "lucide-react";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";
import {
  getAutoRefreshPageKey,
  isAutoRefreshEnabledForPage,
} from "src/view/browser/state/tabs/auto-refresh-pages";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";

/** 自動更新機能が所有するページ操作コマンドを登録する。 */
export function registerAutoRefreshCommands(api: ExtensionApi): void {
  api.addCommand(
    {
      id: "auto-refresh.toggle",
      label: ({ viewPage, viewTab }) =>
        isAutoRefreshEnabledForPage(viewTab, viewPage) ? "自動更新を停止" : "自動更新を開始",
      englishLabel: ({ viewPage, viewTab }) =>
        isAutoRefreshEnabledForPage(viewTab, viewPage) ? "Stop Auto Refresh" : "Start Auto Refresh",
      description: "表示中のスレッドや板の自動更新を切り替えます",
      keywords: ["自動更新", "auto refresh", "更新", "実況"],
      group: "page",
      icon: Timer,
      when: ({ viewPage }) => getAutoRefreshPageKey(viewPage) != null,
      run: ({ dispatch, viewPage, viewTab }) => {
        const pageKey = getAutoRefreshPageKey(viewPage);
        if (pageKey == null) return;
        dispatch(
          tabActions.setAutoRefreshEnabled(
            !isAutoRefreshEnabledForPage(viewTab, viewPage),
            pageKey,
          ),
        );
      },
    },
    { beforeCommandId: "layout.toggle-zen-mode" },
  );
}
