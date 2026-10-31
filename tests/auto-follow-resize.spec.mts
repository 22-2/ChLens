import { expect, test } from "./fixtures.mjs";
import { openThreadFromBoard, waitForThreadLoaded } from "./thread-scroll-helpers.mjs";

test("ウィンドウを広い状態から狭くしても自動更新の追従が外れない", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("config_auto_load_second", "5000");
  });
  await page.setViewportSize({ width: 1400, height: 700 });
  const thread = localBoard.addLargeThread(400);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 400);
  const statusButton = page.getByRole("button", { name: /^スレッド自動更新: / });
  await statusButton.click();
  const autoRefreshToggle = page
    .locator(".mini-window__toggle-row")
    .filter({ has: page.getByText("自動更新", { exact: true }) })
    .getByRole("button");
  await autoRefreshToggle.click();
  await expect(autoRefreshToggle).toHaveText("ON");
  await expect(statusButton).toHaveAccessibleName(/^スレッド自動更新: 追従中/);

  await page.getByRole("button", { name: "書き込みパネルを開閉" }).click();
  await expect(statusButton).toHaveAccessibleName(/^スレッド自動更新: 追従中/);
  // 本文欄が折り返しで伸びる状態でも、幅の縮小で追従が外れないようにする。
  await page
    .getByRole("textbox", { name: "本文" })
    .fill("これは幅が狭くなると折り返して本文欄が伸びる長い入力です。".repeat(8));
  // ウィンドウの端をドラッグする操作に近づけ、幅を細かく連続で縮める。
  for (let width = 1400; width >= 380; width -= 20) {
    await page.setViewportSize({ width, height: 700 });
    await page.waitForTimeout(16);
    // 自動更新の取得が縮小中に重なる場合も含める。
    if (width % 100 === 0) localBoard.appendLargeThreadPosts(3);
  }
  await page.waitForTimeout(600);
  await expect(statusButton).toHaveAccessibleName(/^スレッド自動更新: 追従中/);
  const atBottom = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(
      ".content-area__tab-panel[data-active='true']",
    );
    return panel ? panel.scrollHeight - panel.clientHeight - panel.scrollTop : null;
  });
  expect(atBottom).not.toBeNull();
  expect(atBottom!).toBeLessThanOrEqual(2);
});
