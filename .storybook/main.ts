import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import { createChLensStorybookThreadProxy } from "./thread-proxy.ts";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryAliases = {
  src: path.resolve(repositoryRoot, "src"),
  packages: path.resolve(repositoryRoot, "packages"),
  "@chlen/ch-lib": path.resolve(repositoryRoot, "packages/ch-lib/src/index.ts"),
};

const config: StorybookConfig = {
  // ChLens本体とLiveを同じカタログで確認し、共通UIの見た目を比較できるようにする。
  stories: [
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../apps/chlens-live/src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    const configuredAliases = config.resolve?.alias;
    // 変更理由: Storybook既定設定が配列形式のaliasを返す場合もあるため、
    // オブジェクトへ展開して既存aliasを壊さず、同じ形式のまま追加する。
    const alias = Array.isArray(configuredAliases)
      ? [
          ...configuredAliases,
          ...Object.entries(repositoryAliases).map(([find, replacement]) => ({
            find,
            replacement,
          })),
        ]
      : Object.assign({}, configuredAliases, repositoryAliases);

    return {
      ...config,
      plugins: [...(config.plugins ?? []), createChLensStorybookThreadProxy()],
      resolve: {
        ...config.resolve,
        alias,
      },
    };
  },
};

export default config;
