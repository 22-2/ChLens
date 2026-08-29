import type { UserConfig } from "@ladle/react";

const config: UserConfig = {
  // ChLens本体とLiveを同じ一覧で見比べられるよう、Storyの探索範囲をルートに揃える。
  stories: ["src/**/*.stories.{ts,tsx}", "apps/chlens-live/src/**/*.stories.{ts,tsx}"],
  viteConfig: ".ladle/vite.config.ts",
  addons: {
    a11y: { enabled: true },
  },
};

export default config;
