import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawDirectory = path.join(root, "coverage/e2e/raw");
function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

await rm(rawDirectory, { recursive: true, force: true });

const vp = path.join(root, "node_modules/vite-plus/bin/vp");
// E2E中に利用者向けソースへ対応づけられるよう、coverage buildではsource mapを埋め込む。
let exitCode = await run(process.execPath, [vp, "build"], {
  ...process.env,
  PLATFORM: "chrome",
  ENTRY: "browser",
  VITE_COVERAGE: "true",
});

if (exitCode === 0) {
  exitCode = await run(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--project=chrome",
      ...process.argv.slice(2).filter((arg) => arg !== "--e2e-only"),
    ],
    {
      ...process.env,
      E2E_COVERAGE: "true",
    },
  );
}

const reportExit = await run(process.execPath, [
  "scripts/merge-coverage.mjs",
  ...process.argv.slice(2).filter((arg) => arg === "--e2e-only"),
]);
if (reportExit !== 0) exitCode ||= reportExit;

// CIの作業領域は実行後に破棄されるため、通常ビルドへの復元はローカルだけで行う。
if (!process.env.CI) {
  const restoreExit = await run(process.execPath, [vp, "build"], {
    ...process.env,
    PLATFORM: "chrome",
    ENTRY: "browser",
    VITE_COVERAGE: "false",
  });
  if (restoreExit !== 0) exitCode ||= restoreExit;
}

process.exitCode = exitCode;
