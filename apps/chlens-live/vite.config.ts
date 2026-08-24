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
      // Resolve the workspace package to source during the spike so Live and ch-lib can be
      // tested together before publishing a built package artifact.
      "@chlen/ch-lib": path.resolve(repositoryRoot, "packages/ch-lib/src/index.ts"),
    },
  },
  server: {
    watch: {
      // Tauri compiles locked DLLs under this directory during `tauri dev`; Vite must not watch them.
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
