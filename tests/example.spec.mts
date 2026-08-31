import { test, expect } from "./fixtures.mjs";

test("拡張機能が読み込まれること", async ({ page, extensionId }) => {
  // 拡張機能のポップアップページをテスト
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await expect(page).toHaveTitle(/read\.crx/);
});

test("バックグラウンドのサービスワーカーが動作していること", async ({ context, extensionId }) => {
  const serviceWorkers = context.serviceWorkers();
  expect(serviceWorkers.length).toBeGreaterThan(0);
  expect(serviceWorkers[0].url()).toContain(extensionId);
});
