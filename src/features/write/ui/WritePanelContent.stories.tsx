import type { Meta, StoryObj } from "@storybook/react-vite";
import { AutoScrollStateProvider } from "src/features/auto-refresh/browser/use-auto-scroll-state";
import { WritePanelContent } from "src/features/write/ui/WritePanelContent";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import {
  BOTTOM_PANEL_WRITE_TAB_ID,
  BottomPanelProvider,
} from "src/view/browser/hooks/use-bottom-panel";
import { PaneProvider, useTabStore } from "src/view/browser/state/tabs/use-tab-store";

import { PanelStoryEnvironment } from "../../../../.storybook/panel-story-fixtures";

const meta = {
  title: "ChLens/書き込み/書き込みパネル",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "サンプルスレッドに返信する下部の書き込みパネルです。入力欄や画像添付、設定操作を確認できます。",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function WritePanelStory() {
  const { paneId } = useTabStore();
  return (
    <PaneProvider paneId={paneId}>
      <BottomPanelProvider
        isolated
        layout={{ isOpen: true, height: 460, activeTabId: BOTTOM_PANEL_WRITE_TAB_ID }}
      >
        <AutoScrollStateProvider>
          <div className="browser-shell" data-theme="dark" style={{ minHeight: "560px" }}>
            <main className="browser-shell__workspace">
              <div className="content-area" style={{ flex: 1, padding: "24px" }}>
                Storybook サンプルスレッド
              </div>
              <StatusBarProvider>
                <section className="bottom-panel" style={{ height: 460 }}>
                  <div className="bottom-panel__header">
                    <div className="bottom-panel__tab-strip" role="tablist">
                      <button
                        className="bottom-panel__tab bottom-panel__tab--active"
                        role="tab"
                        aria-selected="true"
                      >
                        書き込み
                      </button>
                    </div>
                  </div>
                  <div className="bottom-panel__body" role="tabpanel">
                    <WritePanelContent />
                  </div>
                </section>
                <StatusBar />
              </StatusBarProvider>
            </main>
          </div>
        </AutoScrollStateProvider>
      </BottomPanelProvider>
    </PaneProvider>
  );
}

export const Default: Story = {
  name: "標準",
  render: () => (
    <PanelStoryEnvironment>
      <WritePanelStory />
    </PanelStoryEnvironment>
  ),
};
