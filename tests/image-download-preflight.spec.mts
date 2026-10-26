import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.mjs";

async function openUrl(page: Page, url: string) {
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(url);
  await urlInput.press("Enter");
}

test("画像の自動取得は5MB以内だけ先行し、超過・サイズ不明は確認する", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const exactLimitUrl = `${localBoard.origin}/img/1.png`;
  const oversizedUrl = `${localBoard.origin}/img/2.png`;
  const unknownSizeUrl = `${localBoard.origin}/img/3.png`;
  localBoard.setImageContentLength(1, 5_000_000);
  localBoard.setImageContentLength(2, 5_500_000);
  localBoard.setImageHeadStatus(3, 405);
  localBoard.setDat(
    `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>上限内 ${exactLimitUrl} 超過 ${oversizedUrl} サイズ不明 ${unknownSizeUrl}<>ローカルテストスレッド`,
  );
  await page.addInitScript(() => {
    localStorage.setItem("config_manual_image_loading", "off");
    localStorage.setItem("config_image_auto_download_limit_mb", "5");
  });

  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await openUrl(page, localBoard.threadUrl);
  const responses = page.locator(
    '.content-area__tab-panel[data-active="true"] .thread-page__responses',
  );
  await expect(responses.locator('[data-res-num="1"]')).toContainText("上限内");

  const methodsFor = (path: string) =>
    localBoard.requestMethods.filter((_, index) => localBoard.requests[index] === path);
  await expect.poll(() => methodsFor("/img/1.png")).toContain("GET");
  await expect.poll(() => methodsFor("/img/2.png")).toEqual(["HEAD"]);
  await expect.poll(() => methodsFor("/img/3.png")).toEqual(["HEAD"]);
  expect(methodsFor("/img/1.png").slice(0, 2)).toEqual(["HEAD", "GET"]);
  const oversizedImageButton = responses.getByRole("button", { name: /5\.50 MB/u }).last();
  await expect(oversizedImageButton).toBeVisible();
  await expect(
    responses.getByRole("button", { name: "画像サイズを確認できません。クリックして確認" }).last(),
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await oversizedImageButton.click();
  await expect.poll(() => methodsFor("/img/2.png")).toContain("GET");
  expect(methodsFor("/img/2.png").slice(0, 2)).toEqual(["HEAD", "GET"]);

  page.once("dialog", (dialog) => dialog.accept());
  await responses
    .getByRole("button", { name: "画像サイズを確認できません。クリックして確認" })
    .last()
    .click();
  await expect.poll(() => methodsFor("/img/3.png")).toContain("GET");
  expect(methodsFor("/img/3.png").slice(0, 2)).toEqual(["HEAD", "GET"]);
  await expect(responses.locator(`img[src="${exactLimitUrl}"]`)).toBeVisible();
});
