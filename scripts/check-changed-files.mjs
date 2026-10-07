import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function gitOutput(args) {
  const result = spawnSync("git", args, { encoding: "buffer" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.toString("utf8");
}

const eventName = process.env.GITHUB_EVENT_NAME;
let base;
if (eventName === "pull_request" && process.env.GITHUB_BASE_REF) {
  base = `origin/${process.env.GITHUB_BASE_REF}`;
} else {
  base = process.env.CI_DIFF_BASE;
  if (!base || /^0+$/.test(base)) base = "HEAD^";
}

// NUL区切りで読むことで空白・改行を含むパスも壊さず、削除済みファイルは対象外にする。
const changedPaths = gitOutput([
  "diff",
  "--name-only",
  "-z",
  "--diff-filter=ACMR",
  `${base}...HEAD`,
  "--",
])
  .split("\0")
  .filter(Boolean)
  .filter((path) => /^(?:src|packages|scripts)\//.test(path))
  .filter((path) => /\.(?:[cm]?[jt]sx?|vue|svelte)$/.test(path));

if (changedPaths.length === 0) {
  console.log("変更されたコードファイルがないため、vp checkをスキップします。");
} else {
  // 変更パスをシェル文字列へ連結せずargvで渡し、特殊文字によるコマンド実行を防ぐ。
  run("pnpm", ["exec", "vp", "check", ...changedPaths.map((path) => `./${path}`)]);
}
