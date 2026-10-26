import { useCallback, useMemo, useState } from "react";
import type { TabBarItem } from "src/features/tabs/browser/tab-bar-layout";
import { TabBarView } from "src/features/tabs/ui/TabBarView";
import type { Page, Tab } from "src/view/browser/types";

export default { title: "ChLens/TabBar" };

// 変更理由: 大量のタブではみ出し方（水平は横スクロール、垂直は縦スクロール）を実際に触って確かめるため、
// ストアを使わず、タブの追加・閉じる・並べ替え・選択をローカルの状態で動かす。
function createPage(index: number): Page {
  if (index % 3 === 1) {
    return {
      type: "threadList",
      title: `スレ一覧 ${index + 1}：とても長い板名の一覧タイトル`,
      boardUrl: `https://example.com/board${index}/`,
      boardTitle: `板 ${index + 1}`,
    };
  }
  return { type: "boardList", title: `板一覧 ${index + 1}：はみ出すかどうかを確かめる` };
}

function createTab(id: string, index: number, pinned: boolean): Tab {
  return {
    id,
    history: [createPage(index)],
    currentIndex: 0,
    pinned,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  };
}

function createTabs(count: number, pinnedCount: number): Tab[] {
  return Array.from({ length: count }, (_, index) =>
    createTab(`tab-${index + 1}`, index, index < pinnedCount),
  );
}

interface TabBarHarnessProps {
  tabCount: number;
  pinnedCount?: number;
  isVertical: boolean;
  initialCollapsed?: boolean;
}

function TabBarHarness({
  tabCount,
  pinnedCount = 0,
  isVertical,
  initialCollapsed = false,
}: TabBarHarnessProps) {
  const [tabs, setTabs] = useState(() => createTabs(tabCount, pinnedCount));
  const [nextTabNumber, setNextTabNumber] = useState(tabCount + 1);
  const [selectedTabId, setSelectedTabId] = useState(tabs[0]?.id ?? "");
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [width, setWidth] = useState(208);

  const items = useMemo<TabBarItem[]>(
    () =>
      tabs.map((tab, index) => ({
        tab,
        isActive: tab.id === selectedTabId,
        // 自動更新のインジケーターも並べて確かめられるよう、一部のタブに状態を付ける。
        autoRefreshIndicatorState: index % 5 === 2 ? "active" : index % 5 === 4 ? "inactive" : null,
      })),
    [selectedTabId, tabs],
  );

  const onSelectTab = useCallback((tabId: string) => setSelectedTabId(tabId), []);

  const onCloseTab = useCallback(
    (tabId: string) => {
      const index = tabs.findIndex((tab) => tab.id === tabId);
      if (index === -1) return;
      const nextTabs = tabs.filter((tab) => tab.id !== tabId);
      setTabs(nextTabs);
      if (tabId === selectedTabId) {
        setSelectedTabId(nextTabs[Math.min(index, nextTabs.length - 1)]?.id ?? "");
      }
    },
    [selectedTabId, tabs],
  );

  const onAddTab = useCallback(() => {
    const id = `tab-${nextTabNumber}`;
    setTabs((current) => [...current, createTab(id, nextTabNumber - 1, false)]);
    setNextTabNumber((current) => current + 1);
    setSelectedTabId(id);
  }, [nextTabNumber]);

  const onMoveTab = useCallback((tabId: string, visibleIndex: number) => {
    setTabs((current) => {
      const from = current.findIndex((tab) => tab.id === tabId);
      if (from === -1) return current;
      const moving = current[from];
      const rest = current.filter((tab) => tab.id !== tabId);
      rest.splice(Math.min(visibleIndex, rest.length), 0, moving);
      return rest;
    });
    return true;
  }, []);

  const onStepTab = useCallback(
    (delta: 1 | -1) => {
      const index = tabs.findIndex((tab) => tab.id === selectedTabId);
      if (index === -1) return false;
      const next = tabs[(index + delta + tabs.length) % tabs.length];
      setSelectedTabId(next.id);
      return true;
    },
    [selectedTabId, tabs],
  );

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: isVertical ? "100vh" : undefined,
        background: "var(--sys-color-tab-strip)",
      }}
    >
      <TabBarView
        items={items}
        selectedTabId={selectedTabId}
        isVertical={isVertical}
        collapsed={collapsed}
        width={width}
        canCloseTab={tabs.length > 1}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onAddTab={onAddTab}
        onMoveTab={onMoveTab}
        onStepTab={onStepTab}
        onSetCollapsed={setCollapsed}
        onCommitWidth={(nextWidth, expand) => {
          if (expand) setCollapsed(false);
          setWidth(nextWidth);
        }}
        onTabContextMenu={() => {}}
        onBarContextMenu={() => {}}
      />
    </div>
  );
}

export function HorizontalFewTabs() {
  return <TabBarHarness tabCount={3} isVertical={false} />;
}

/** 水平で30タブ開いたとき。右端のフェードと、固定される追加ボタンを確かめる。 */
export function HorizontalManyTabs() {
  return <TabBarHarness tabCount={30} isVertical={false} />;
}

export function HorizontalManyTabsWithPinned() {
  return <TabBarHarness tabCount={30} pinnedCount={3} isVertical={false} />;
}

/** 垂直で30タブ開いたとき。縦スクロールと上下のフェード、最後の追加ボタンを確かめる。 */
export function VerticalManyTabs() {
  return <TabBarHarness tabCount={30} isVertical />;
}

export function VerticalManyTabsCollapsed() {
  return <TabBarHarness tabCount={30} isVertical initialCollapsed />;
}

export function VerticalManyTabsWithPinned() {
  return <TabBarHarness tabCount={30} pinnedCount={3} isVertical />;
}
