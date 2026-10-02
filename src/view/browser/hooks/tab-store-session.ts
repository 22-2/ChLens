import type { TabStoreState } from "src/view/browser/hooks/tab-store-types";
import type { Page, Pane, Tab } from "src/view/browser/types";
import { createHomeTab, ensurePaneHomeTab } from "src/view/browser/types";
import { resetAutoRefreshState } from "src/view/browser/utils/auto-refresh-pages";
import {
  getBrowserSessionJson,
  setBrowserSessionJson,
} from "src/view/browser/utils/browser-session-storage";

export function sanitizeTabStoreState(state: TabStoreState): TabStoreState {
  return {
    ...state,
    // 変更理由: どのペインにも常設ホームを先頭に保ち、他タブのピン留めで埋もれさせない。
    panes: state.panes.map((pane) =>
      ensurePaneHomeTab({
        ...pane,
        tabs: pane.tabs.map((tab) => resetAutoRefreshState(tab)),
      }),
    ),
    closedTabs: state.closedTabs.map((tab) => resetAutoRefreshState(tab)),
  };
}

function normalizeLoadedTab(tab: Tab): Tab {
  // 常設ホームの旧ページ種別は専用のhomeへ移し、通常タブには板一覧だけを残す。
  if (tab.locked) {
    return { ...tab, ...createHomeTab(tab.id) };
  }

  const history: Page[] = [];
  let currentIndex = 0;
  for (const [index, page] of (tab.history ?? []).entries()) {
    const type = (page as { type: string }).type;
    const migratedPage: Page =
      type === "home" || type === "boardTree" ? { type: "boardList", title: "板一覧" } : page;
    // 旧階層の「板ツリー → 板一覧」が同じ画面への二度の戻る操作にならないようまとめる。
    if (!(migratedPage.type === "boardList" && history.at(-1)?.type === "boardList")) {
      history.push(migratedPage);
    }
    if (index <= tab.currentIndex) currentIndex = history.length - 1;
  }
  if (history.length === 0) history.push({ type: "boardList", title: "板一覧" });

  const normalized = {
    ...tab,
    history,
    currentIndex,
    pinned: tab.pinned ?? false,
    locked: tab.locked ?? false,
    reloadKey: tab.reloadKey ?? 0,
  };
  // 変更理由: 旧セッションに自動更新状態が残っていても復元時は常にOFFへ正規化する。
  return resetAutoRefreshState(normalized);
}

// 旧形状（単一タブリスト）のセッションも読めるようにするための型。
type LegacyTabStoreState = {
  tabs?: Tab[];
  activeTabId?: string;
  closedTabs?: Tab[];
};

/**
 * 保存形式の移行と実行時状態の除外をタブストア本体から分離する。
 *
 * 変更理由: reducerとセッションI/Oを同じモジュールに置くと、純粋なタブ操作の変更が
 * localStorageの互換性へ波及するため、復元・保存だけをこの境界で扱う。
 */
export function loadTabStoreSession(): TabStoreState | null {
  try {
    const raw = getBrowserSessionJson();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TabStoreState & LegacyTabStoreState;

    // 新形状: panes を持つ
    if (parsed.panes?.length && parsed.activePaneId) {
      const panes = parsed.panes
        .filter((pane) => pane.tabs?.length > 0)
        .map((pane) =>
          ensurePaneHomeTab({
            ...pane,
            tabs: pane.tabs.map((tab) => normalizeLoadedTab(tab)),
            activeTabId: pane.tabs.some((tab) => tab.id === pane.activeTabId)
              ? pane.activeTabId
              : pane.tabs[0].id,
          }),
        );
      if (panes.length === 0) return null;
      const activePaneId = panes.some((p) => p.id === parsed.activePaneId)
        ? parsed.activePaneId
        : panes[0].id;
      return {
        panes,
        activePaneId,
        closedTabs: (parsed.closedTabs ?? []).map((tab) => normalizeLoadedTab(tab)),
      };
    }

    // 旧形状: 単一タブリスト → 単一ペインへ移行
    if (parsed.tabs && parsed.tabs.length > 0 && parsed.activeTabId) {
      const tabs = parsed.tabs.map((tab) => normalizeLoadedTab(tab));
      const activeTabId = tabs.some((tab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : tabs[0].id;
      const pane: Pane = ensurePaneHomeTab({
        id: crypto.randomUUID(),
        tabs,
        activeTabId,
      });
      return {
        panes: [pane],
        activePaneId: pane.id,
        closedTabs: (parsed.closedTabs ?? []).map((tab) => normalizeLoadedTab(tab)),
      };
    }
  } catch (error) {
    console.error("[TabStoreSession] セッションの復元に失敗しました", error);
  }
  return null;
}

export function saveTabStoreSession(state: TabStoreState): void {
  try {
    void setBrowserSessionJson(JSON.stringify(sanitizeTabStoreState(state))).catch((error) => {
      console.error("[TabStoreSession] セッションの保存に失敗しました", error);
    });
  } catch (error) {
    // localStorage容量超過等でも、現在のタブ操作は継続できるようログだけ残す。
    console.error("[TabStoreSession] セッションの保存に失敗しました", error);
  }
}
