import type { Dispatch, RefObject } from "react";
import { createLogger } from "src/app/logger";
import {
  getPageActionWindowId,
  isPageTargetAvailable,
  type PageActionResult,
} from "src/view/browser/extension/page-actions";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { findTabLocation } from "src/view/browser/state/tabs/tab-store-selectors";
import type { ScopedTabAction, TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import type { Page } from "src/view/browser/types";

const logger = createLogger("view/browser/workspace");

export interface BoundWorkspace {
  /** 対象への操作を送れたか返す。同じページの場合など、状態が変わらない操作もある。 */
  openPage: (
    page: Page,
    options?: { newTab?: boolean },
  ) => Exclude<PageActionResult, "unsupported">;
}

/** 実行元と最新のタブ状態を結び付けた操作窓口を作る。 */
export function createBoundWorkspace(
  viewWindow: Window,
  tabId: string,
  stateRef: RefObject<TabStoreState>,
  dispatch: Dispatch<ScopedTabAction>,
): BoundWorkspace {
  return {
    openPage: (page, options = {}) => {
      const location = findTabLocation(stateRef.current, tabId);
      // 同一タブを別窓へ移した後の古いコマンドからも、移動先を誤操作しない。
      if (!location || !isPageTargetAvailable(viewWindow, tabId)) {
        logger.warn("ページを開けませんでした", {
          windowId: getPageActionWindowId(viewWindow),
          tabId,
          result: "target-unavailable",
        });
        return "target-unavailable";
      }
      // 本窓の選択タブからの遷移は従来どおりペインもアクティブにする。
      // 別窓からは本窓のアクティブペインを奪わない。
      const pane = stateRef.current.panes.find((candidate) => candidate.id === location.paneId);
      const activatePane = viewWindow === globalThis.window && pane?.activeTabId === tabId;
      // ペインとタブを明示し、選択中の別タブへの暗黙のフォールバックを避ける。
      dispatch(
        options.newTab
          ? { ...tabActions.openInNewTab(page), paneId: location.paneId }
          : { ...tabActions.navigate(page), paneId: location.paneId, tabId, activatePane },
      );
      return "executed";
    },
  };
}
