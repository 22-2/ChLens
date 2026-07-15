import { test, expect } from "./fixtures.mjs";

test.describe("ポップアップUIテスト", () => {
  test("メインUI要素が表示されること", async ({ page, extensionId }) => {
    // ポップアップページに移動
    await page.goto(`chrome-extension://${extensionId}/view/index.html`);

    // メインコンテナが表示されているか
    await expect(page.locator("#body")).toBeVisible();

    // 左ペインと右ペインが表示されているか
    await expect(page.locator("#left_pane")).toBeVisible();
    await expect(page.locator("#right_pane")).toBeVisible();

    // タブ関連の要素が表示されているか
    await expect(page.locator("#tab_a")).toBeVisible();
    await expect(page.locator("#tab_b")).toBeVisible();
  });

  test("キーボードヘルプ要素が存在すること", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/view/index.html`);

    // キーボードヘルプ要素が存在するか確認（表示状態は問わない）
    const keyboardHelp = page.locator(".keyboard_help");
    await expect(keyboardHelp).toHaveClass(/keyboard_help/);

    // キーボードヘルプが初期状態では非表示であることを確認
    await expect(keyboardHelp).toHaveClass(/hidden/);
  });
});

test.describe("ナビゲーションテスト", () => {
  test("設定ページにアクセスできること", async ({ page, extensionId }) => {
    // 設定ページに直接アクセス
    const response = await page.goto(`chrome-extension://${extensionId}/view/config.html`);

    // ページが正常に読み込まれたことを確認
    expect(response?.status()).toBe(200);

    // 設定ページのURLを確認
    await expect(page).toHaveURL(/.*config\.html$/);

    // ページの基本要素を確認
    await expect(page.locator("body")).toBeVisible();

    // 設定ページに特有の要素を確認
    const pageTitle = await page.title();
    expect(pageTitle).toBeTruthy(); // タイトルが設定されているか

    // 設定項目のコンテナが存在するか確認
    const configContainer = page
      .locator('.config-container, #config, [class*="config"], [id*="config"]')
      .first();
    if ((await configContainer.count()) > 0) {
      await expect(configContainer).toBeVisible();
    } else {
      // 設定項目のコンテナが見つからない場合は、少なくとも何らかのコンテンツが表示されていることを確認
      const content = await page.content();
      expect(content.length).toBeGreaterThan(100); // 適当な長さのコンテンツがあるか
    }
  });
});
