/**
 * スレッド表示の性能を、比較元のビルドと今の作業ツリーのビルドで測って比べる。
 *
 * 使い方: `node scripts/perf-thread.mjs [比較元のref（既定: origin/develop）] [回数（既定: 3）]`
 * 比較元は一時的な git worktree に取り出してビルドし、終わったら取り除く。
 * 計測は tests/perf/thread-virtual-scroll.perf.spec.mts（通常のE2Eからは外している）を
 * 両方のビルドへ同じ回数かけ、各値の中央値を test-results/perf/summary.md へ書き出す。
 *
 * 変更理由: 仮想スクロールの効果を数字で確かめるため、導入前と同じ手順・同じ環境で測る。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [baseRef = "origin/develop", rawRuns = "3"] = process.argv.slice(2);
const runs = Number.parseInt(rawRuns, 10);
if (!Number.isInteger(runs) || runs <= 0) {
  console.error("使い方: node scripts/perf-thread.mjs [比較元のref] [回数]");
  process.exit(2);
}
const outputDir = path.join(root, "test-results", "perf");
const playwrightCli = path.join(root, "node_modules/@playwright/test/cli.js");
const spec = "tests/perf/thread-virtual-scroll.perf.spec.mts";

function run(command, args, { cwd = root, env = {}, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
      // pnpmはWindowsではcmdのラッパーなので、シェル経由でないと起動できない。
      shell: command === "pnpm",
    });
    let stdout = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} が ${signal} で終了しました`));
      else if (code !== 0)
        reject(new Error(`${command} ${args.join(" ")} が終了コード ${code} で失敗しました`));
      else resolve(stdout.trim());
    });
  });
}

/** 比較元のコミットを一時 worktree に取り出し、依存は本体の node_modules へリンクしてビルドする。 */
async function buildBase(ref) {
  const sha = await run("git", ["rev-parse", "--short", ref], { capture: true });
  const worktree = path.join(os.tmpdir(), `chlens-perf-base-${sha}`);
  if (existsSync(worktree)) await run("git", ["worktree", "remove", "--force", worktree]);
  await run("git", ["worktree", "add", "--detach", worktree, sha]);
  // install し直すと数分かかるため、同じ lockfile の前提で依存をリンクする。
  await symlink(path.join(root, "node_modules"), path.join(worktree, "node_modules"), "junction");
  const chlibModules = path.join(root, "packages/chlib/node_modules");
  if (existsSync(chlibModules)) {
    await symlink(chlibModules, path.join(worktree, "packages/chlib/node_modules"), "junction");
  }
  await run("pnpm", ["run", "build:chrome"], { cwd: worktree });
  return { sha, worktree, extensionPath: path.join(worktree, "debug/chrome") };
}

async function measure(label, extensionPath) {
  const results = [];
  for (let index = 1; index <= runs; index++) {
    const runLabel = `${label}-${index}`;
    await run(process.execPath, [playwrightCli, "test", "--project=chrome", spec, "--workers=1"], {
      env: {
        CHLENS_PERF: "true",
        CHLENS_PERF_LABEL: runLabel,
        ...(extensionPath ? { CHLENS_E2E_EXTENSION_PATH: extensionPath } : {}),
      },
    });
    results.push(JSON.parse(await readFile(path.join(outputDir, `${runLabel}.json`), "utf8")));
  }
  return results;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** 計測ごとの { 場面: { 指標: 値 } } を、指標ごとの中央値へまとめる。 */
function summarize(results) {
  const summary = {};
  for (const [scene, metrics] of Object.entries(results[0])) {
    if (typeof metrics !== "object") continue;
    summary[scene] = {};
    for (const name of Object.keys(metrics)) {
      summary[scene][name] = median(results.map((result) => result[scene][name]));
    }
  }
  return summary;
}

function formatTable(before, after, baseSha) {
  const lines = [
    `比較元: ${baseRef} (${baseSha}) / 比較先: 作業ツリー / 各${runs}回の中央値`,
    "",
    "| 場面 | 指標 | 導入前 | 導入後 | 変化 |",
    "|---|---|---:|---:|---:|",
  ];
  for (const [scene, metrics] of Object.entries(after)) {
    for (const [name, value] of Object.entries(metrics)) {
      const previous = before[scene]?.[name];
      const change =
        typeof previous === "number" && previous !== 0
          ? `${Math.round(((value - previous) / previous) * 100)}%`
          : "-";
      lines.push(`| ${scene} | ${name} | ${previous ?? "-"} | ${value} | ${change} |`);
    }
  }
  return lines.join("\n");
}

await mkdir(outputDir, { recursive: true });
await run("pnpm", ["run", "build:chrome"]);
const base = await buildBase(baseRef);
try {
  const before = summarize(await measure("before", base.extensionPath));
  const after = summarize(await measure("after"));
  const table = formatTable(before, after, base.sha);
  await writeFile(path.join(outputDir, "summary.md"), `${table}\n`);
  console.info(`\n${table}\n\n[perf] 保存先: ${path.join(outputDir, "summary.md")}`);
} finally {
  await run("git", ["worktree", "remove", "--force", base.worktree]);
  await rm(base.worktree, { recursive: true, force: true });
}
