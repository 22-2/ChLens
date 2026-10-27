import type { Meta, StoryObj } from "@storybook/react-vite";
import { SidePanel } from "src/view/browser/shell/SidePanel";

import { PanelStoryEnvironment } from "../../../../.storybook/panel-story-fixtures";

const meta = {
  title: "ChLens/サイドパネル",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "各ビューを切り替えるサイドパネルです。画像一覧にはStorybook用の取得済みサンプル画像を表示します。",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ImageGallery: Story = {
  name: "画像一覧",
  render: () => (
    <PanelStoryEnvironment sidePanelView="images">
      <div className="browser-shell" data-theme="dark" style={{ height: "680px" }}>
        <div className="browser-shell__workspace">
          <main className="content-area" style={{ flex: 1, padding: "24px" }}>
            Storybook サンプルスレッド
          </main>
          <SidePanel />
        </div>
      </div>
    </PanelStoryEnvironment>
  ),
};
