import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = path.resolve(appRoot, "../..");

export default defineConfig({
  resolve: {
    alias: {
      "@chlens-live": path.resolve(appRoot, "src"),
      src: path.resolve(repositoryRoot, "src"),
      packages: path.resolve(repositoryRoot, "packages"),
      // ワークスペース内のパッケージを公開前のソースでテストするため、Viteと同じソースエイリアスを使う。
      "@chlen/ch-lib": path.resolve(repositoryRoot, "packages/ch-lib/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Reactコンポーネントテストでjest-domマッチャー（toBeVisible等）を使うためのsetup。
    setupFiles: ["src/app/test-setup.ts"],
  },
});
