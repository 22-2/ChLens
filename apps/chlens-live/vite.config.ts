import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@chlens-live": path.resolve(appRoot, "src"),
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
