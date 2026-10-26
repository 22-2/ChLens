import path from "node:path";
import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/react-vite";

import { createChLensStorybookThreadProxy } from "./thread-proxy.ts";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryAliases = {
  src: path.resolve(repositoryRoot, "src"),
  packages: path.resolve(repositoryRoot, "packages"),
  "@chlen/chlib": path.resolve(repositoryRoot, "packages/chlib/src/index.ts"),
};

// 変更理由: 本体の vite.config.ts は拡張機能向けに react / react-dom を preact/compat へ差し替えている。
// Storybook はこの設定を読み込むため、Storybook 本体の描画（react-dom）と preact が混ざり
// 「Cannot add property __, object is not extensible」で描画が止まる。Storybook では本物の React を使うので、
// この差し替えだけを外す。
const PREACT_ALIAS_KEYS = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
]);

function withoutPreactAliases<T>(aliases: T): T {
  if (Array.isArray(aliases)) {
    return aliases.filter(
      (entry: { find?: unknown }) =>
        !(typeof entry.find === "string" && PREACT_ALIAS_KEYS.has(entry.find)),
    ) as T;
  }
  if (aliases == null || typeof aliases !== "object") {
    return aliases;
  }
  return Object.fromEntries(
    Object.entries(aliases).filter(([key]) => !PREACT_ALIAS_KEYS.has(key)),
  ) as T;
}

const config: StorybookConfig = {
  // ChLens本体のStoryだけを読み込み、削除済みの旧Liveアプリへ依存しないようにする。
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    const configuredAliases = withoutPreactAliases(config.resolve?.alias);
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
