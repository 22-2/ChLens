import { existsSync } from "node:fs";

import { test } from "./fixtures.mjs";

test("手動の別窓確認", async ({ tauri, localBoard }) => {
  test.setTimeout(0);
  console.log(`TEST_THREAD_URL=${localBoard.threadUrl}`);
  console.log(`TEST_DATA_DIR=${tauri.dataDir}`);
  console.log("READY");
  while (!existsSync(".git/codex-manual-window-check.done")) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
});
