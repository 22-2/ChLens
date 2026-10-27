import { test } from "./fixtures.mjs";
import { verifyBuiltInPages } from "./page-types-scenarios.mjs";

test("ページ種別ごとに表示と操作が切り替わる", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await verifyBuiltInPages(page);
});
