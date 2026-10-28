import { expect, test } from "./fixtures.mjs";
import { jumpToResponse } from "./thread-scroll-helpers.mjs";

test("画像をレス内で展開し、仮想スクロール後も状態を保つ", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const image1 = `${localBoard.origin}/img/1.png`;
  const image2 = `${localBoard.origin}/img/2.png`;
  localBoard.setImageBody(
    1,
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="900"><rect width="1800" height="900" fill="blue"/></svg>',
    ),
    "image/svg+xml",
  );
  localBoard.setImageBody(
    2,
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="2000"><rect width="400" height="2000" fill="blue"/></svg>',
    ),
    "image/svg+xml",
  );
  const posts = Array.from({ length: 150 }, (_, i) =>
    i === 0
      ? `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>画像 ${image1} ${image2}<>ローカルテストスレッド`
      : `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local002<>本文 ${i + 1}<>`,
  );
  localBoard.setDat(posts.join("\n"));
  await page.addInitScript(() => {
    localStorage.setItem("config_manual_image_loading", "off");
    localStorage.setItem("config_confirm_external_link", "off");
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(localBoard.threadUrl);
  await urlInput.press("Enter");
  const first = page.locator('[data-res-num="1"]');
  await expect(first.locator(".res__thumb--image")).toHaveCount(2);
  await expect(first.getByRole("button", { name: "このレスの画像をすべて保存" })).toBeVisible();
  const saveAll = first.getByRole("button", { name: "このレスの画像をすべて保存" });
  const saveOne = first.getByRole("button", { name: `画像を保存: ${image1}` });
  await expect(saveOne).toBeVisible();
  await expect(saveOne.locator("svg")).toHaveCount(1);
  await expect(saveOne).toHaveText("");
  await expect(saveAll.locator("svg")).toHaveCount(1);
  const thumbsBox = (await first.locator(".res__thumbs").boundingBox())!;
  expect((await saveAll.boundingBox())!.y).toBeGreaterThanOrEqual(thumbsBox.y + thumbsBox.height);
  await first.locator(".res__thumb--image").first().click();
  await expect(first.getByRole("button", { name: "画像を折りたたむ" })).toBeVisible();
  const image = first.locator(".res__inline-image img");
  await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1800);
  expect(await image.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(480);
  expect(await image.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(
    (await page.evaluate(() => window.innerHeight)) * 0.6,
  );
  expect(await image.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(
    await first.evaluate((el) => el.getBoundingClientRect().width),
  );
  await first.locator(".res__thumb--image").first().click();
  const portrait = first.locator(".res__inline-image img").nth(1);
  await expect
    .poll(() => portrait.evaluate((el) => (el as HTMLImageElement).naturalHeight))
    .toBe(2000);
  const portraitBox = (await portrait.boundingBox())!;
  expect(portraitBox.height).toBeLessThanOrEqual(
    (await page.evaluate(() => window.innerHeight)) * 0.6,
  );
  expect(portraitBox.width / portraitBox.height).toBeCloseTo(0.2, 2);
  await first.getByRole("button", { name: "画像を折りたたむ" }).nth(1).click();
  await expect(page.locator(".media-viewer")).toHaveCount(0);
  await jumpToResponse(page, 150);
  await expect(first).toHaveCount(0);
  await jumpToResponse(page, 1);
  await expect(first.getByRole("button", { name: "画像を折りたたむ" })).toBeVisible();
  await first.getByRole("button", { name: "画像を折りたたむ" }).click();
  await expect(first.locator(".res__thumb--image")).toHaveCount(2);
});

test("画像のメニューからビューアを別窓で開く", async ({
  page,
  extensionId,
  localBoard,
  context,
}) => {
  const image = `${localBoard.origin}/img/1.png`;
  localBoard.setDat(
    `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>画像 ${image}<>ローカルテストスレッド`,
  );
  await page.addInitScript(() => localStorage.setItem("config_manual_image_loading", "off"));
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  const thumb = page.locator('.content-area__tab-panel[data-active="true"] .res__thumb--image');
  await thumb.click({ button: "right" });
  const open = page.getByRole("menuitem", { name: "ビューアを別窓で開く" });
  await expect(open).toBeVisible();
  const popupPromise = context.waitForEvent("page");
  await open.click();
  const popup = await popupPromise;
  await expect(popup.locator(".media-viewer")).toBeVisible();
  await expect(popup).toHaveTitle("ビューア - read.crx 2");
});

test("サムネイルと展開画像のメニューからビューアを開く", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const image = `${localBoard.origin}/img/1.png`;
  localBoard.setDat(
    `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>画像 ${image}<>ローカルテストスレッド`,
  );
  await page.addInitScript(() => localStorage.setItem("config_manual_image_loading", "off"));
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  const thumb = page.locator('.content-area__tab-panel[data-active="true"] .res__thumb--image');
  await thumb.click({ button: "right" });
  await page.getByRole("menuitem", { name: "ビューアで開く", exact: true }).click();
  await expect(page.locator(".media-viewer__label")).toHaveText(image);
  await page.locator(".media-viewer__close").click();
  await thumb.click();
  const expanded = page.getByRole("button", { name: "画像を折りたたむ" });
  await expect(expanded).toBeVisible();
  await expanded.click({ button: "right" });
  await page.getByRole("menuitem", { name: "ビューアで開く", exact: true }).click();
  await expect(page.locator(".media-viewer__label")).toHaveText(image);
});
