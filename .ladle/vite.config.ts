import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export default defineConfig({
  resolve: {
    alias: {
      src: path.resolve(repositoryRoot, "src"),
      packages: path.resolve(repositoryRoot, "packages"),
      "@chlen/ch-lib": path.resolve(repositoryRoot, "packages/ch-lib/src/index.ts"),
    },
  },
});
