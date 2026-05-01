import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // アプリ本体と同じ src/* エイリアスで解決しないと、UIコンポーネントの実装をそのままテストできない。
      src: fileURLToPath(new URL("./src", import.meta.url)),
      packages: fileURLToPath(new URL("./packages", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    exclude: ["node_modules/**", "e2e/**"],
  },
});
