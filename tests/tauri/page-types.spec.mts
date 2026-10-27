import { verifyBuiltInPages } from "../page-types-scenarios.mjs";
import { test } from "./fixtures.mjs";

test("ページ種別ごとに表示と操作が切り替わる", async ({ page }) => {
  await verifyBuiltInPages(page);
});
