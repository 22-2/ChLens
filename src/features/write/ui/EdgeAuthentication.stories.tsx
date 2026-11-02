import type { Meta, StoryObj } from "@storybook/react-vite";
import { createEdgeAuthPage } from "src/features/write/fixtures/edge-auth-page";

const meta = {
  title: "ChLens/書き込み/エッヂ認証の模擬画面",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Agreement: Story = {
  name: "規約同意と認証",
  render: () => (
    <iframe
      title="模擬認証ページ"
      sandbox="allow-scripts"
      srcDoc={createEdgeAuthPage()}
      style={{ width: "100%", height: "90vh", border: 0 }}
    />
  ),
};
