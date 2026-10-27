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
  // 画像のコピーは右クリックメニューにあり、項目の有効状態はメニューを開いた時点で決まる。
  // 読み込み前に開くと無効のままになるため、画像の読み込み完了を待ってから開く。
  const viewerImage = viewer.locator(".media-viewer__image");
  await expect
    .poll(() => viewerImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await viewerImage.click({ button: "right" });
  const copyItem = page.getByRole("menuitem", { name: "画像をコピー", exact: true });
  await expect(copyItem).toBeEnabled();
  await copyItem.click();

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
