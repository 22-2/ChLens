import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = path.resolve(appRoot, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@chlens-live": path.resolve(appRoot, "src"),
      src: path.resolve(repositoryRoot, "src"),
      packages: path.resolve(repositoryRoot, "packages"),
      // 試作段階ではワークスペース内のパッケージをソースへ解決し、Liveとch-libを
      // ビルド済みパッケージの公開前に一緒にテストできるようにする。
      "@chlen/ch-lib": path.resolve(repositoryRoot, "packages/ch-lib/src/index.ts"),
    },
  },
  server: {
    watch: {
      // `tauri dev` はこのディレクトリにロック中のDLLを生成するため、Viteの監視対象から外す。
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    outDir: path.resolve(appRoot, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(appRoot, "index.html"),
        overlay: path.resolve(appRoot, "overlay.html"),
      },
    },
  },
});
