import { test } from "./fixtures.mjs";
import { seedPageTypesSession, verifyRestoredPages } from "./page-types-restoration.mjs";
import { verifyBuiltInPages } from "./page-types-scenarios.mjs";

test("ページ種別ごとに表示と操作が切り替わる", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await verifyBuiltInPages(page);
});

test("各ページのタブと旧新規タブを再読み込み後も復元する", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await seedPageTypesSession(page, localBoard);
  await verifyRestoredPages(page);
  await page.reload();
  await verifyRestoredPages(page);
});
