import { expect, test } from "./fixtures.mjs";
import { openThreadFromBoard, waitForThreadLoaded } from "./thread-scroll-helpers.mjs";

test("スレの滑らかなスクロールを有効にしてホイールで移動できる", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await page.getByRole("button", { name: "スレ", exact: true }).click();
  await page.getByRole("switch", { name: "スレを滑らかにスクロールする" }).click();

  const thread = localBoard.addLargeThread(500);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 500);
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await panel.hover();
  const start = await panel.evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 300);
  await expect
    .poll(() => panel.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(start + 350);

  // 慣性中に別の操作で移動した位置を、古いホイールの目標位置へ戻さない。
  await page.mouse.wheel(0, 300);
  const target = await panel.evaluate((element) => {
    element.scrollTop += 2000;
    return element.scrollTop;
  });
  await page.waitForTimeout(500);
  expect(Math.abs((await panel.evaluate((element) => element.scrollTop)) - target)).toBeLessThan(
    100,
  );
});
