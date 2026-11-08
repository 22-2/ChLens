import { expect, test } from "./fixtures.mjs";

test("Zenモードをコマンドから切り替え、パレットを再び開ける", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  const shell = page.locator(".browser-shell");
  await expect(shell).toBeVisible();

  await page.keyboard.press("Control+Shift+P");
  const commandInput = page.getByPlaceholder("コマンドを検索...");
  await expect(commandInput).toBeVisible();
  await expect(commandInput).toHaveValue("");
  await commandInput.pressSequentially("zen");
  await page.getByRole("option", { name: /Zenモードを開始/u }).click();

  await expect(shell).toHaveAttribute("data-zen-mode", "true");
  await expect(page.locator(".title-bar")).toBeHidden();
  await expect(page.locator(".tab-bar")).toBeHidden();
  await expect(page.locator(".status-bar")).toBeHidden();
  await expect(commandInput).toBeHidden();

  await page.keyboard.press("Control+Shift+P");
  const zenPalette = page.locator(".zen-mode__palette");
  const zenCommandInput = zenPalette.getByPlaceholder("コマンドを検索...");
  await expect(zenCommandInput).toBeVisible();
  await expect(zenCommandInput).toHaveValue("");
  await zenCommandInput.pressSequentially("zen");
  const exitZenModeCommand = page.getByRole("option", { name: /Zenモードを終了/u });
  await expect(exitZenModeCommand).toBeVisible();
  await exitZenModeCommand.click();
  await expect(shell).toHaveAttribute("data-zen-mode", "false");
  await expect(page.locator(".title-bar")).toBeVisible();
  await expect(page.locator(".tab-bar")).toBeVisible();
});

test("オムニバーのルートから各モードに入り戻れる", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  for (const [label, placeholder] of [
    ["お気に入り", "お気に入りを検索..."],
    ["板", "板を検索..."],
    ["閲覧履歴", "閲覧履歴を検索..."],
    ["書き込み履歴", "書き込み履歴を検索..."],
  ]) {
    await page.getByRole("option", { name: new RegExp(`${label}.*モードを開く`) }).click();
    const input = page.getByPlaceholder(placeholder);
    await expect(input).toBeFocused();
    await input.press("Escape");
    await expect(page.getByPlaceholder("URLを入力")).toBeFocused();
  }
});
