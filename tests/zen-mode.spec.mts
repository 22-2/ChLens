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

  await page.keyboard.press("Control+Shift+P");
  const commandInput = page.getByPlaceholder("コマンドを検索...");
  await commandInput.fill(">zen");
  await page.getByRole("option", { name: /Zenモードを開始/u }).click();

  const shell = page.locator(".browser-shell");
  await expect(shell).toHaveAttribute("data-zen-mode", "true");
  await expect(page.locator(".title-bar")).toBeHidden();
  await expect(page.locator(".tab-bar")).toBeHidden();
  await expect(page.locator(".status-bar")).toBeHidden();

  await page.keyboard.press("Control+Shift+P");
  const zenPalette = page.locator(".zen-mode__palette");
  await expect(zenPalette.getByPlaceholder("コマンドを検索...")).toBeVisible();
  await zenPalette.getByPlaceholder("コマンドを検索...").fill(">zen");
  await page.getByRole("option", { name: /Zenモードを終了/u }).click();
  await expect(shell).toHaveAttribute("data-zen-mode", "false");
  await expect(page.locator(".title-bar")).toBeVisible();
  await expect(page.locator(".tab-bar")).toBeVisible();
});

