import { test, expect } from './fixtures.mjs';

test('extension loads', async ({ page, extensionId }) => {
  // 拡張機能のポップアップページをテスト
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await expect(page).toHaveTitle(/read\.crx/);
});

test('background service worker is running', async ({ context, extensionId }) => {
  const serviceWorkers = context.serviceWorkers();
  expect(serviceWorkers.length).toBeGreaterThan(0);
  expect(serviceWorkers[0].url()).toContain(extensionId);
});
