import "../src/view/browser/styles/index.css";
import "./story-canvas.css";

import type { Preview } from "@storybook/react-vite";

// 変更理由: Storybookの型検査はアプリ側のVite aliasを共有しないため、リポジトリルートから相対参照する。
import { TooltipProvider } from "../src/view/browser/ui/Tooltip";
import { container } from "../src/service-container";
import type { IConfig, IMessage } from "../src/service-container/interfaces";

// 変更理由: Storybookはアプリのbootを通らないため、設定を読む部品がサービス未登録の
// エラーを出さず、既定の表示で操作できるようにメモリ上の設定だけを用意する。
const storyConfig = new Map<string, string>([
  ["confirm_external_links", "off"],
  ["manual_image_loading", "off"],
  ["display_ng", "soft-ng"],
]);

container.config = {
  get: (key) => storyConfig.get(key) ?? null,
  set: (key, value) => {
    storyConfig.set(key, String(value));
  },
  ready: (callback) => callback(),
  getAll: () => Object.fromEntries(storyConfig),
} satisfies IConfig;

container.message = {
  send: () => {},
  on: <T = unknown,>(_type: string, _callback: (data: T) => void) => {},
  off: <T = unknown,>(_type: string, _callback: (data: T) => void) => {},
} satisfies IMessage;

const preview: Preview = {
  globalTypes: {
    theme: {
      name: "テーマ",
      description: "ライト/ダークテーマを切り替える",
      toolbar: {
        icon: "circlehollow",
        items: [
          { value: "light", title: "ライト" },
          { value: "dark", title: "ダーク" },
        ],
      },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [
    (Story, context) => {
      document.documentElement.dataset.theme = context.globals.theme === "dark" ? "dark" : "light";
      return (
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      );
    },
  ],
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
  },
};

export default preview;
