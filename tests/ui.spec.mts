import { expect, test } from "./fixtures.mjs";

// React版の入口から検証し、旧HTMLの要素に依存させない。
test("起動時にホームと新しいタブの操作が表示される", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await expect(page.locator(".browser-shell")).toBeVisible();
  await expect(page.getByRole("button", { name: "板一覧を開く", exact: true })).toBeVisible();
  await page.getByTitle("新しいタブ", { exact: true }).click();
  await page.getByTitle("URLバーを表示", { exact: true }).click();
  await expect(page.getByPlaceholder("URLを入力")).toBeVisible();
});

test("ナビゲーションから設定画面を開ける", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await expect(page.locator(".settings-page__shell")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "設定カテゴリ" })).toBeVisible();
});
