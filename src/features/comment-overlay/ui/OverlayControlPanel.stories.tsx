import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  type CommentOverlayGeometry,
  type CommentOverlayMonitor,
  DEFAULT_COMMENT_OVERLAY_GEOMETRY,
} from "../platform/types";
import { OverlayControlPanel } from "./OverlayControlPanel";

const monitors: readonly CommentOverlayMonitor[] = [
  {
    id: "left",
    name: "左モニター",
    x: -1_920,
    y: 120,
    width: 1_920,
    height: 1_080,
    scaleFactor: 1,
  },
  {
    id: "main",
    name: "メインモニター",
    x: 0,
    y: 0,
    width: 2_560,
    height: 1_440,
    scaleFactor: 1.25,
  },
];

const meta = {
  title: "ChLens/コメントOverlay/操作パネル",
  component: OverlayControlPanel,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Overlayを常時クリック透過にしたまま、Main側の仮想デスクトップから表示領域を移動・リサイズする操作を確認します。",
      },
    },
  },
} satisfies Meta<typeof OverlayControlPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlPanelPreview() {
  const [geometry, setGeometry] = useState<CommentOverlayGeometry>(
    DEFAULT_COMMENT_OVERLAY_GEOMETRY,
  );
  return (
    <div style={{ width: "min(720px, 94vw)" }}>
      <OverlayControlPanel monitors={monitors} geometry={geometry} onGeometryChange={setGeometry} />
    </div>
  );
}

export const VirtualDesktop: Story = {
  args: {
    monitors,
    geometry: DEFAULT_COMMENT_OVERLAY_GEOMETRY,
    onGeometryChange: () => undefined,
  },
  render: () => <ControlPanelPreview />,
};
