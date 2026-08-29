import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

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
  viteFinal: async (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        src: path.resolve(repositoryRoot, "src"),
        packages: path.resolve(repositoryRoot, "packages"),
        "@chlen/ch-lib": path.resolve(repositoryRoot, "packages/ch-lib/src/index.ts"),
      },
    },
  }),
};

export default config;
