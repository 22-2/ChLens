import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vite-plus/test";

const sourceRoot = resolve(process.cwd(), "src");
const forbiddenNames = new Set(["PATTERNS", "ROUTE_PATTERNS", "HOSTNAME", "TSLD"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("掲示板URLの依存境界", () => {
  it("srcから掲示板URLの低水準定数をimportしない", () => {
    const imports = sourceFiles(sourceRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [
        ...source.matchAll(
          /import\s*\{([^}]+)\}\s*from\s*["'](?:packages\/chlib\/src\/index|@chlen\/chlib)["']/gs,
        ),
      ].flatMap((match) =>
        match[1]
          .split(",")
          .map((name) => name.trim().split(/\s+as\s+/)[0])
          .filter((name) => forbiddenNames.has(name))
          .map((name) => `${file}: ${name}`),
      );
    });

    expect(imports).toEqual([]);
  });

  it("coreのURLモジュールに独自URLクラスを定義しない", () => {
    const source = readFileSync(resolve(sourceRoot, "core/network/URL.ts"), "utf8");

    // 旧window.app公開APIはChURLの別名で保ち、二重実装による仕様差を防ぐ。
    expect(source).not.toMatch(/\bclass\s+URL\b/);
    expect(source).toMatch(/export\s*\{\s*ChURL\s+as\s+URL\s*\}/);
  });
});
