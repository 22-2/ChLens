import { seedPageTypesSession, verifyRestoredPages } from "../page-types-restoration.mjs";
import { verifyBuiltInPages } from "../page-types-scenarios.mjs";
import { test } from "./fixtures.mjs";

test("ページ種別ごとに表示と操作が切り替わる", async ({ page }) => {
  await verifyBuiltInPages(page);
});

test("各ページのタブと旧新規タブを再起動後も復元する", async ({ tauri, localBoard }) => {
  await seedPageTypesSession(tauri.page, localBoard);
  await verifyRestoredPages(tauri.page);
  await tauri.restart();
  await verifyRestoredPages(tauri.page);
});
