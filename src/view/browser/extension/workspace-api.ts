import type { Dispatch } from "react";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { ScopedTabAction } from "src/view/browser/state/tabs/tab-store-types";
import type { Page, Tab } from "src/view/browser/types";

/** コマンドの実行元となった表示タブとペインスコープ付き操作。 */
export interface WorkspaceCommandContext {
  viewTab: Tab;
  dispatch: Dispatch<ScopedTabAction>;
}

/** コマンドの実行元に結び付けてタブ操作を行う窓口。 */
export interface WorkspaceApi {
  openPage: (context: WorkspaceCommandContext, page: Page, options?: { newTab?: boolean }) => void;
  getActiveTab: (context: WorkspaceCommandContext) => Tab;
}

export const workspaceApi: WorkspaceApi = {
  openPage: (context, page, options = {}) => {
    if (options.newTab) {
      context.dispatch(tabActions.openInNewTab(page));
      return;
    }
    context.dispatch(tabActions.navigate(page));
  },
  // viewTab は通常ペインでは選択中タブ、分離ウィンドウでは描画対象のタブを指す。
  getActiveTab: (context) => context.viewTab,
};
