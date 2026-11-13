import { expect, test } from "./fixtures.mjs";
import { SCREENSHOT_THREAD_TITLE, seedScreenshotThreads } from "./screenshots/ui-scenario.mjs";

test("ミッドナイトのスレ一覧とレスで文字の階層とIDの位置を保つ", async ({
  page,
  extensionId,
  localBoard,
}, testInfo) => {
  seedScreenshotThreads(localBoard);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.evaluate(() => localStorage.setItem("config_theme_id", "midnight"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme-id", "midnight");
  await page.getByRole("button", { name: "板一覧を開く", exact: true }).click();
  const menu = page.getByRole("button", { name: "テスト板メニュー", exact: true });
  if ((await menu.getAttribute("aria-expanded")) === "false") await menu.click();
  const category = page.getByRole("button", { name: "テストカテゴリ", exact: true });
  if ((await category.getAttribute("aria-expanded")) === "false") await category.click();
  await page.getByText("ローカルテスト板", { exact: true }).click();
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  const title = panel.getByText(SCREENSHOT_THREAD_TITLE, { exact: true });
  await expect(title).toBeVisible();
  const sizes = await title.evaluate((element) => ({
    title: parseFloat(getComputedStyle(element).fontSize),
    table: parseFloat(getComputedStyle(element.closest("table")!).fontSize),
  }));
  expect(sizes.title).toBeGreaterThan(sizes.table);
  await page.screenshot({ path: testInfo.outputPath("thread-list.png") });
  await title.click();
  const response = panel.locator('.thread-page__responses [data-res-num="1"]');
  await expect(response).toBeVisible();
  const header = response.locator(".res__header");
  const bounds = await header.evaluate((element) => {
    const id = element.querySelector(".res__id")!.getBoundingClientRect();
    const headerBox = element.getBoundingClientRect();
    return { rightGap: headerBox.right - id.right };
  });
  expect(bounds.rightGap).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath("thread.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(response).toBeVisible();
  const narrowBounds = await header.evaluate((element) => {
    const id = element.querySelector(".res__id")!.getBoundingClientRect();
    const headerBox = element.getBoundingClientRect();
    return { rightGap: headerBox.right - id.right, leftGap: id.left - headerBox.left };
  });
  expect(narrowBounds.rightGap).toBeLessThan(2);
  expect(narrowBounds.leftGap).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath("thread-narrow.png") });
});

test("設定画面から追加テーマを選び再読み込み後も復元する", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTitle("設定を開く", { exact: true }).first().click();
  await page.getByRole("button", { name: "表示", exact: true }).click();
  await page
    .locator("select")
    .filter({ has: page.locator('option[value="midnight"]') })
    .selectOption("midnight");
  await expect(page.locator("html")).toHaveAttribute("data-theme-id", "midnight");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme-id", "midnight");
});
