import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function readDebateInstructions(): string {
  // 変更理由: スキルとMCPの判定基準がずれないよう、同じMarkdownを毎回読み込んで返す。
  const filePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../skills/chlens-debate/references/analysis.md",
  );
  const instructions = readFileSync(filePath, "utf8").trim();
  if (!instructions) throw new Error(`議論判定指示が空です: ${filePath}`);
  return instructions;
}
