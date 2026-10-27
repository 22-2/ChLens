import React, { useCallback, useState } from "react";
import type { TabBarOrientation } from "src/features/tabs/browser/tab-bar-layout";
import { useTabBarModel } from "src/features/tabs/browser/use-tab-bar-model";
import { TabBarView } from "src/features/tabs/ui/TabBarView";
import { TabContextMenu } from "src/features/tabs/ui/TabContextMenu";
import type { Tab } from "src/view/browser/types";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";

interface ContextMenuState {
  tab: Tab;
  x: number;
  y: number;
}

interface BarContextMenuState {
  x: number;
  y: number;
}

/**
 * ストアと接続したタブバー。状態と操作はモデルから、見た目は TabBarView から得る。
 */
export const TabBar: React.FC<{
  orientation?: TabBarOrientation;
  /** 共通タブバーで、このペインのタブ一覧に付ける見出し。 */
  sectionLabel?: string;
  /** 見出しの横へ添える、ペインがフォーカス中かどうか。 */
  isPaneFocused?: boolean;
  /** 共通タブバーに続けて並べる他ペインのタブ一覧。 */
  extraSections?: React.ReactNode;
  /** 共通タブバーの2つ目以降のペインとして、タブ一覧だけを描く。 */
  embedded?: boolean;
}> = ({ orientation = "horizontal", sectionLabel, isPaneFocused, extraSections, embedded }) => {
  const isVertical = orientation === "vertical";
  const model = useTabBarModel(isVertical);
  const { setCollapsed, setWidth } = model;
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [barContextMenu, setBarContextMenu] = useState<BarContextMenuState | null>(null);

  const handleTabContextMenu = useCallback((tab: Tab, x: number, y: number) => {
    setContextMenu({ tab, x, y });
  }, []);

  const handleBarContextMenu = useCallback((x: number, y: number) => {
    setBarContextMenu({ x, y });
  }, []);

  const handleCommitWidth = useCallback(
    (width: number, expand: boolean) => {
      // 変更理由: 縮小中に敷居を超えて広げた時だけ展開へ移し、確定した幅を保存する。
      if (expand) {
        setCollapsed(false);
      }
      setWidth(width);
    },
    [setCollapsed, setWidth],
  );

  const overlay = (
    <>
      {/* お気に入り操作はURLバー展開後とナビゲーションメニューに残すため、
          タブバー右端には表示せず、バー開閉ボタン付近の重複を避ける。 */}
      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.tab}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {barContextMenu && (
        <ContextMenu
          x={barContextMenu.x}
          y={barContextMenu.y}
          items={model.barMenuItems}
          onClose={() => setBarContextMenu(null)}
        />
      )}
    </>
  );

  return (
    <TabBarView
      items={model.items}
      selectedTabId={model.selectedTabId}
      isVertical={isVertical}
      collapsed={model.collapsed}
      width={model.width}
      canCloseTab={model.canCloseTab}
      onSelectTab={model.onSelectTab}
      onCloseTab={model.onCloseTab}
      onAddTab={model.onAddTab}
      onMoveTab={model.onMoveTab}
      onStepTab={model.onStepTab}
      onSetCollapsed={setCollapsed}
      onCommitWidth={handleCommitWidth}
      onTabContextMenu={handleTabContextMenu}
      onBarContextMenu={handleBarContextMenu}
      overlay={overlay}
      sectionLabel={sectionLabel}
      isPaneFocused={isPaneFocused}
      extraSections={extraSections}
      embedded={embedded}
    />
  );
};
