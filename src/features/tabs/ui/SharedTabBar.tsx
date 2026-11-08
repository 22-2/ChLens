import { Settings } from "lucide-react";
import React from "react";
import type { TabBarOrientation } from "src/features/tabs/browser/tab-bar-layout";
import { TabBar } from "src/features/tabs/ui/TabBar";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import {
  PaneProvider,
  useTabStore,
  useWindowPanes,
} from "src/view/browser/state/tabs/use-tab-store";
import { getCurrentPage } from "src/view/browser/types";
import { createSettingsPage } from "src/view/browser/utils/tab-pages";

const TabBarSettings: React.FC = () => {
  const { state, dispatch } = useTabStore();
  const openSettings = () => {
    // 操作中のペインに設定があれば再利用し、重複した設定タブを作らない。
    const existing = state.tabs.find((tab) => getCurrentPage(tab).type === "settings");
    dispatch(
      existing
        ? tabActions.selectTab(existing.id)
        : tabActions.openInNewTabForce(createSettingsPage(), { focus: true }),
    );
  };
  return (
    <div className="tab-bar__footer">
      <button
        type="button"
        className="tab-bar__settings icon-button"
        title="設定を開く"
        aria-label="設定を開く"
        onClick={openSettings}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <Settings size={17} />
      </button>
    </div>
  );
};

function getPaneLabel(index: number, paneCount: number): string {
  if (paneCount === 2) return index === 0 ? "左" : "右";
  return `ペイン ${index + 1}`;
}

/**
 * 全ペイン共通のタブバー。垂直は画面左端、水平はタイトルバーの下に置く。
 *
 * 変更理由: 垂直モードでタブバーをタイトルバーの上端まで伸ばすと、ペインごとにタブバーを
 * 持てなくなる。水平モードも含めて向きによらず同じ操作にするため、先頭ペインのタブバーを
 * 本体（垂直では開閉・幅変更を持つ）にし、残りのペインはタブ一覧だけを続けて並べ、
 * 1つのバーで全ペインのタブを扱えるようにする。
 */
export const SharedTabBar: React.FC<{ orientation: TabBarOrientation }> = ({ orientation }) => {
  const { panes, activePaneId } = useWindowPanes();
  const [first, ...rest] = panes;
  if (!first) return null;
  const showLabels = panes.length > 1;

  return (
    <PaneProvider paneId={first.id}>
      <TabBar
        orientation={orientation}
        sectionLabel={showLabels ? getPaneLabel(0, panes.length) : undefined}
        isPaneFocused={showLabels && first.id === activePaneId}
        footer={
          <PaneProvider paneId={activePaneId}>
            <TabBarSettings />
          </PaneProvider>
        }
        extraSections={rest.map((pane, index) => (
          <PaneProvider key={pane.id} paneId={pane.id}>
            <TabBar
              orientation={orientation}
              embedded
              sectionLabel={getPaneLabel(index + 1, panes.length)}
              isPaneFocused={pane.id === activePaneId}
            />
          </PaneProvider>
        ))}
      />
    </PaneProvider>
  );
};
