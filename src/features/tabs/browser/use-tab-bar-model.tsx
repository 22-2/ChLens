import { PanelLeft, PanelTop, Plus, RotateCcw } from "lucide-react";
import { useCallback, useMemo } from "react";
import { createLogger } from "src/app/logger";
import {
  isArchiveReplayThread as matchesArchiveReplayThread,
  useArchiveReplayPositionStore,
} from "src/features/archive-replay/browser/position-store";
import { useAutoScrollState } from "src/features/auto-refresh/browser/use-auto-scroll-state";
import type { TabBarItem } from "src/features/tabs/browser/tab-bar-layout";
import { useDetachedTabController } from "src/features/tabs/browser/use-detached-tab-controller";
import {
  TAB_BAR_ORIENTATION_CONFIG_KEY,
  useVerticalTabBarLayout,
} from "src/features/tabs/browser/use-tab-bar-orientation";
import { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import { container } from "src/service-container/index";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { isAutoRefreshEnabledForPage } from "src/view/browser/state/tabs/auto-refresh-pages";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";

const logger = createLogger("tabs");

interface AutoScrollSnapshot {
  canAutoScroll: boolean;
  isAutoScrolling: boolean;
  isPaused: boolean;
}

function getAutoRefreshIndicatorState(
  tab: Tab,
  isActive: boolean,
  autoScroll: AutoScrollSnapshot,
): TabBarItem["autoRefreshIndicatorState"] {
  const page = getCurrentPage(tab);
  // 変更理由: スレ/スレ一覧どちらも同じページ単位の自動更新として扱い、
  // タブ上の表示だけ別判定になってズレるのを防ぐ。
  if (page.type !== "thread" && page.type !== "threadList") {
    return null;
  }
  if (!isAutoRefreshEnabledForPage(tab, page)) {
    return null;
  }
  if (page.type === "threadList") {
    return isActive ? "active" : "inactive";
  }
  const isRunning =
    isActive && !autoScroll.isPaused && (autoScroll.canAutoScroll || autoScroll.isAutoScrolling);
  return isRunning ? "active" : "inactive";
}

function getMoveTargetIndex(
  pane: { tabs: Tab[] },
  dragTabId: string,
  visibleIndex: number,
  isDetachedTab: (tabId: string) => boolean,
): number | null {
  const dragTab = pane.tabs.find((tab) => tab.id === dragTabId);
  // 表示中のタブだけを基準に、同じピン留めグループ内で移動先を計算する。
  if (!dragTab) {
    return null;
  }

  const group = pane.tabs.filter((tab) => tab.pinned === dragTab.pinned);
  const groupWithoutDrag = group.filter((tab) => tab.id !== dragTabId);
  const visibleGroup = groupWithoutDrag.filter((tab) => !isDetachedTab(tab.id));
  const clampedVisibleIndex = Math.max(0, Math.min(visibleIndex, visibleGroup.length));
  const referenceTab = visibleGroup[clampedVisibleIndex];
  if (referenceTab) {
    return groupWithoutDrag.findIndex((tab) => tab.id === referenceTab.id);
  }

  const lastVisibleTab = visibleGroup[visibleGroup.length - 1];
  if (!lastVisibleTab) {
    return groupWithoutDrag.length;
  }
  return groupWithoutDrag.findIndex((tab) => tab.id === lastVisibleTab.id) + 1;
}

export interface TabBarModel {
  items: TabBarItem[];
  selectedTabId: string;
  collapsed: boolean;
  width: number;
  setCollapsed: (collapsed: boolean) => void;
  setWidth: (width: number) => void;
  canCloseTab: boolean;
  barMenuItems: ContextMenuItem[];
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  /** 表示中の並び順 visibleIndex へタブを移す。移動できなければ false を返す。 */
  onMoveTab: (tabId: string, visibleIndex: number) => boolean;
  /** 選択中タブから delta 個ぶん前後へ切り替える。切り替えられなければ false を返す。 */
  onStepTab: (delta: 1 | -1) => boolean;
}

/**
 * タブバーが必要とする状態と操作を、ストアとサービスから組み立てる。
 *
 * 変更理由: 見た目と DOM の挙動を表示部品（TabBarView）へ分け、ストアに依存する部分をここへ集めることで、
 * 表示部品をストーリーや単独の描画で動かせるようにする。
 */
export function useTabBarModel(isVertical: boolean): TabBarModel {
  const { state, stateRef, dispatch, paneId } = useTabStore();
  const selectedTabId = state.selectedTabId;
  const { isDetachedTab } = useDetachedTabController();
  // 切り離し中のタブはTabStoreに保持したまま、元窓の操作対象からだけ除外する。
  // 別窓を明示的に戻した時に同じタブを復元できるよう、ここで削除は行わない。
  const visibleTabs = useMemo(
    () => state.tabs.filter((tab) => !isDetachedTab(tab.id)),
    [isDetachedTab, state.tabs],
  );
  const { canAutoScroll, isAutoScrolling, isPaused } = useAutoScrollState();
  const archiveReplayPosition = useArchiveReplayPositionStore((state) => state.position);
  const { collapsed, width, setCollapsed, setWidth } = useVerticalTabBarLayout();

  const items = useMemo<TabBarItem[]>(() => {
    const autoScroll = { canAutoScroll, isAutoScrolling, isPaused };
    return visibleTabs.map((tab) => {
      const isActive = tab.id === selectedTabId;
      const page = getCurrentPage(tab);
      return {
        tab,
        isActive,
        autoRefreshIndicatorState: getAutoRefreshIndicatorState(tab, isActive, autoScroll),
        // 変更理由: 再生対象の専用スレッドタブを、通常のスレッドタブと見分けられるようにする。
        isArchiveReplayThread:
          page.type === "thread" &&
          matchesArchiveReplayThread(archiveReplayPosition, tab.id, page.threadUrl),
      };
    });
  }, [archiveReplayPosition, canAutoScroll, isAutoScrolling, isPaused, selectedTabId, visibleTabs]);

  const selectedTab = visibleTabs.find((tab) => tab.id === selectedTabId) ?? visibleTabs[0] ?? null;
  const runTabCommand = useTabCommandRunner(selectedTab?.id ?? "");

  const onSelectTab = useCallback(
    (tabId: string) => {
      dispatch(tabActions.selectTab(tabId));
    },
    [dispatch],
  );

  const onCloseTab = useCallback(
    (tabId: string) => {
      // 変更理由: 中クリックは選択中タブと異なるタブにも発生するため、
      // コマンドへ対象IDを渡して所有ペインを解決する。
      runTabCommand(TAB_COMMAND_IDS.CLOSE, { tabId });
    },
    [runTabCommand],
  );

  const onAddTab = useCallback(() => {
    dispatch(tabActions.addTab());
  }, [dispatch]);

  const onMoveTab = useCallback(
    (tabId: string, visibleIndex: number) => {
      const pane = stateRef.current.panes.find((candidate) => candidate.id === paneId);
      if (!pane) return false;
      const fullTargetIndex = getMoveTargetIndex(pane, tabId, visibleIndex, isDetachedTab);
      if (fullTargetIndex == null) return false;
      dispatch(tabActions.moveTab(tabId, fullTargetIndex));
      return true;
    },
    [dispatch, isDetachedTab, paneId, stateRef],
  );

  const onStepTab = useCallback(
    (delta: 1 | -1) => {
      // stateRef はグローバル状態を指すので、自ペインを解決してからタブ列を取り出す。
      const pane =
        stateRef.current.panes.find((p) => p.id === paneId) ??
        stateRef.current.panes.find((p) => p.id === stateRef.current.activePaneId);
      if (!pane) return false;
      const tabs = pane.tabs.filter((tab) => !isDetachedTab(tab.id));
      const currentIdx = tabs.findIndex((t) => t.id === pane.activeTabId);
      if (currentIdx === -1) return false;

      const nextIdx = (currentIdx + delta + tabs.length) % tabs.length;
      // 変更理由: タブ列が横にはみ出していても、ホイールによる横スクロールを
      // 優先するとアクティブタブが切り替わらず、タブバーの表示位置だけが変わるため。
      // 切り替え後のアクティブタブは別の effect で必要な場合だけ表示位置へ追従させる。
      dispatch(tabActions.selectTab(tabs[nextIdx].id));
      return true;
    },
    [dispatch, isDetachedTab, paneId, stateRef],
  );

  const barMenuItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        id: "new-tab",
        label: "新しいタブを開く",
        icon: <Plus size={16} />,
        onSelect: () => dispatch(tabActions.addTab()),
      },
      {
        id: "reopen",
        label: "閉じたタブを開く",
        disabled: state.closedTabs.length === 0,
        icon: <RotateCcw size={16} />,
        onSelect: () => dispatch(tabActions.reopenClosedTab()),
      },
      {
        id: "toggle-orientation",
        label: isVertical ? "タブバーを水平にする" : "タブバーを垂直にする",
        icon: isVertical ? <PanelTop size={16} /> : <PanelLeft size={16} />,
        onSelect: () => {
          // 変更理由: 設定画面を開かずに方向を試せるよう、タブバーの右クリックメニューから
          // 切り替える。config_updated 経由で useTabBarOrientation が即時反映する。
          void Promise.resolve(
            container.config.set(
              TAB_BAR_ORIENTATION_CONFIG_KEY,
              isVertical ? "horizontal" : "vertical",
            ),
          ).catch((error) => {
            logger.error("タブバー方向の保存に失敗しました", error);
          });
        },
      },
    ],
    [dispatch, isVertical, state.closedTabs.length],
  );

  return {
    items,
    selectedTabId,
    collapsed,
    width,
    setCollapsed,
    setWidth,
    // 最後の通常タブも閉じられるため、単一ペインでも閉じるボタンを表示する。
    canCloseTab: visibleTabs.some((tab) => !tab.pinned),
    barMenuItems,
    onSelectTab,
    onCloseTab,
    onAddTab,
    onMoveTab,
    onStepTab,
  };
}
