import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.mjs";

async function openUrl(page: Page, url: string) {
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(url);
  await urlInput.press("Enter");
}

test("スレの画像をビューアで開き、PNG画像としてコピーする", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const imageUrl = `${localBoard.origin}/img/1.png`;
  localBoard.setDat(
    `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>画像 ${imageUrl}<>ローカルテストスレッド`,
  );
  await page.addInitScript(() => {
    localStorage.setItem("config_manual_image_loading", "off");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: async (items: ClipboardItem[]) => {
          const png = await items[0]!.getType("image/png");
          (window as Window & { copiedImage?: { type: string; size: number } }).copiedImage = {
            type: png.type,
            size: png.size,
          };
        },
      },
    });
  });

  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await openUrl(page, localBoard.threadUrl);
  await page.locator('.content-area__tab-panel[data-active="true"] .res__thumb--image').click();
  const viewer = page.locator(".media-viewer");
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("button", { name: "画像をコピー" })).toBeEnabled();
  await viewer.getByRole("button", { name: "画像をコピー" }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { copiedImage?: { type: string; size: number } }).copiedImage,
      ),
    )
    .toMatchObject({ type: "image/png", size: expect.any(Number) });
  const copiedImage = await page.evaluate(
    () => (window as Window & { copiedImage?: { type: string; size: number } }).copiedImage,
  );
  expect(copiedImage!.size).toBeGreaterThan(0);
});
