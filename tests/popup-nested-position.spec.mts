import { expect, test } from "./fixtures.mjs";

test("返信ツリー内のIDから子ポップアップを開ける", async ({ page, extensionId, localBoard }) => {
  localBoard.setDat(
    [
      "名無し<>sage<>2026/10/25 ID:root<>起点レス<>ローカルテストスレッド",
      "返信者<>sage<>2026/10/25 ID:repeat<>通常の返信 &gt;&gt;1<>",
      "返信者<>sage<>2026/10/25 ID:repeat<>二度目の返信 &gt;&gt;1<>",
    ].join("\n"),
  );
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  const responses = page.locator(
    '.content-area__tab-panel[data-active="true"] .thread-page__responses',
  );
  await expect(responses.locator('[data-res-num="3"]')).toContainText("二度目の返信");
  await responses.locator('[data-res-num="1"] .res__rep').click();
  const parent = page.locator('.res-popup[data-popup-id^="tree"]');
  await expect(parent).toBeVisible();
  const idLink = parent.locator(".res__id").last();
  const idBox = (await idLink.boundingBox())!;
  await idLink.click();
  const child = page.locator('.res-popup:not([data-popup-id^="tree"])');
  await expect(page.locator(".res-popup")).toHaveCount(2);
  await expect(child).toContainText("ID:repeat");
  // 親の上端ではなく、押したIDの直下に表示する。
  const childBox = (await child.boundingBox())!;
  const parentBox = (await parent.boundingBox())!;
  expect(childBox.y).toBeGreaterThanOrEqual(idBox.y);
  expect(childBox.y).toBeLessThan(idBox.y + idBox.height + 40);
  expect(childBox.x).toBeGreaterThan(parentBox.x);
});
