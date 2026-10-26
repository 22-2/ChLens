import { expect, test } from "./fixtures.mjs";

test("手動画像取得ではサムネイルをクリックするまで画像を要求しない", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const imageUrl = `${localBoard.origin}/img/1.png`;
  localBoard.setDat(
    `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>クリック前には取得しない ${imageUrl}<>ローカルテストスレッド`,
  );
  await page.addInitScript(() => {
    localStorage.setItem("config_manual_image_loading", "on");
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(localBoard.threadUrl);
  await urlInput.press("Enter");

  const response = page.locator('[data-res-num="1"]');
  await expect(response).toContainText("クリック前には取得しない");
  await expect(response.getByRole("button", { name: /画像を読み込む/u }).last()).toBeVisible();
  expect(localBoard.requests).not.toContain("/img/1.png");

  await response
    .getByRole("button", { name: /画像を読み込む/u })
    .last()
    .click();
  await expect
    .poll(() => localBoard.requests.filter((path) => path === "/img/1.png").length)
    .toBeGreaterThanOrEqual(2);
  expect(
    localBoard.requestMethods
      .filter((_, index) => localBoard.requests[index] === "/img/1.png")
      .slice(0, 2),
  ).toEqual(["HEAD", "GET"]);
  await expect(response.locator(`img[src="${imageUrl}"]`)).toBeVisible();
});
