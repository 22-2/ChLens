import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.mjs";

async function openUrl(page: Page, url: string) {
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(url);
  await urlInput.press("Enter");
}

test("Zenモードをコマンドから切り替え、パレットを再び開ける", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  const shell = page.locator(".browser-shell");
  await expect(shell).toBeVisible();

  await page.keyboard.press("Control+Shift+P");
  const commandInput = page.getByPlaceholder("コマンドを検索...");
  await expect(commandInput).toBeVisible();
  await expect(commandInput).toHaveValue(">");
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
  await expect(zenCommandInput).toHaveValue(">");
  await zenCommandInput.pressSequentially("zen");
  const exitZenModeCommand = page.getByRole("option", { name: /Zenモードを終了/u });
  await expect(exitZenModeCommand).toBeVisible();
  await exitZenModeCommand.click();
  await expect(shell).toHaveAttribute("data-zen-mode", "false");
  await expect(page.locator(".title-bar")).toBeVisible();
  await expect(page.locator(".tab-bar")).toBeVisible();
});
