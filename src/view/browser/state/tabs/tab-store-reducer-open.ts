import { getPageIdentity } from "src/view/browser/page-type-definitions";
import {
  createTab,
  createTabFromPage,
  shouldFocusNewTabOnOpen,
} from "src/view/browser/state/tabs/tab-store-new-tab";
import {
  buildHierarchyForNewTab,
  getPane,
  getPaneActiveTab,
  resolvePaneId,
  updatePane,
} from "src/view/browser/state/tabs/tab-store-state-helpers";
import type { ScopedTabActionOf } from "src/view/browser/state/tabs/tab-store-types";
import { type TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { getCurrentPage } from "src/view/browser/types";

/** タブを開く操作（新規タブ追加、ページを新しいタブで開く）の reducer。 */

export function addTab(state: TabStoreState, action: ScopedTabActionOf<"ADD_TAB">): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const pane = getPane(state, paneId);
  const activeTab = getPaneActiveTab(pane);
  const sourcePage = getCurrentPage(activeTab);
  const newTab = createTab(sourcePage, activeTab);
  // 固定タブの後ろに非固定タブを追加
  return {
    ...updatePane(state, paneId, (p) => ({
      ...p,
      tabs: [...p.tabs, newTab],
      activeTabId: newTab.id,
    })),
    // 別窓化で本窓用の代替タブを作る時は、元のフォーカスペインを奪わない。
    activePaneId: action.preserveActivePane ? state.activePaneId : paneId,
  };
}

export function openInNewTab(
  state: TabStoreState,
  action: ScopedTabActionOf<"OPEN_IN_NEW_TAB">,
): TabStoreState {
  // 同一 URL のタブが既に存在する場合はそちらをフォーカスして重複を防ぐ。
  // 重複判定はペイン内に閉じる（別ペインで同じスレを並べて見比べられるように）。
  // 強制的に新タブを開きたい場合は OPEN_IN_NEW_TAB_FORCE を使う。
  const paneId = resolvePaneId(state, action.paneId);
  const pane = getPane(state, paneId);
  const targetIdentity = getPageIdentity(action.page);
  const existingDuplicate = pane.tabs.find(
    (t) => getPageIdentity(getCurrentPage(t)) === targetIdentity,
  );
  if (existingDuplicate) {
    // スレを再度開く操作では既存タブへ移動するため、背景指定は新規作成時だけに適用する。
    // 板などを背景で開く操作は、既存タブがあっても現在の表示を維持する。
    if (action.background && action.page.type !== "thread") return state;
    return {
      ...updatePane(state, paneId, (p) => ({
        ...p,
        activeTabId: existingDuplicate.id,
      })),
      activePaneId: paneId,
    };
  }

  // バックグラウンドで新規タブを開く（アクティブタブ/ペインを切り替えない）。
  // buildHierarchyForNewTab で現在ページの板名を引き継いだカノニカルな祖先履歴を付与する。
  // background フラグが true の場合は、設定値を無視して常にバックグラウンドで開く。
  const newTabForOpen = createTabFromPage(action.page);
  const sourcePageForOpen = getCurrentPage(getPaneActiveTab(pane));
  const newHistoryForOpen = buildHierarchyForNewTab(sourcePageForOpen, action.page);
  const shouldFocus = action.background ? false : shouldFocusNewTabOnOpen();
  const nextPane = updatePane(state, paneId, (p) => ({
    ...p,
    tabs: [
      ...p.tabs,
      {
        ...newTabForOpen,
        history: newHistoryForOpen,
        currentIndex: newHistoryForOpen.length - 1,
      },
    ],
    activeTabId: shouldFocus ? newTabForOpen.id : p.activeTabId,
  }));

  return {
    ...nextPane,
    activePaneId: shouldFocus ? paneId : state.activePaneId,
  };
}

export function openInNewTabForce(
  state: TabStoreState,
  action: ScopedTabActionOf<"OPEN_IN_NEW_TAB_FORCE">,
): TabStoreState {
  const paneId = resolvePaneId(state, action.paneId);
  const pane = getPane(state, paneId);
  const newTabForForce = createTabFromPage(action.page);
  const sourcePageForForce = getCurrentPage(getPaneActiveTab(pane));
  const newHistoryForForce = buildHierarchyForNewTab(sourcePageForForce, action.page);
  const newTab = {
    ...newTabForForce,
    // 同期refとReactでReducerが別々に評価されても、外部から追従するタブのIDを一致させる。
    id: action.tabId ?? newTabForForce.id,
    history: newHistoryForForce,
    currentIndex: newHistoryForForce.length - 1,
  };
  const nextState = updatePane(state, paneId, (p) => ({
    ...p,
    tabs: [...p.tabs, newTab],
    // focus指定時は追加と選択を同じReducer処理で確定し、別dispatch間の状態競合を防ぐ。
    activeTabId: action.focus ? newTab.id : p.activeTabId,
  }));
  return action.focus ? { ...nextState, activePaneId: paneId } : nextState;
}
