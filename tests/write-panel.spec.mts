import { expect, test } from "./fixtures.mjs";
import { openThreadFromBoard, waitForThreadLoaded } from "./thread-scroll-helpers.mjs";

test("書き込み欄は入力に合わせて伸縮し、メニューは画面内で外側クリックで閉じる", async ({
  page,
  extensionId,
  localBoard,
}) => {
  // 高さ変更中に自動更新が解除されたり、末尾への追従が外れたりしないことも確認する。
  await page.addInitScript(() => {
    localStorage.setItem("config_auto_load_second", "5000");
  });
  await page.setViewportSize({ width: 620, height: 700 });
  const thread = localBoard.addLargeThread(20);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 20);
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
  const panel = page.locator(".bottom-panel");
  const input = panel.getByRole("textbox", { name: "本文" });
  await expect(input).toBeVisible();
  const oneLineHeight = (await input.boundingBox())!.height;
  expect((await panel.boundingBox())!.height).toBeLessThan(120);
  await input.fill("1\n2\n3\n4");
  await expect
    .poll(async () => (await input.boundingBox())!.height)
    .toBeGreaterThan(oneLineHeight * 2);
  await expect(statusButton).toHaveAccessibleName(/^スレッド自動更新: 追従中/);
  await input.fill(Array.from({ length: 20 }, (_, i) => String(i)).join("\n"));
  const maxHeight = (await input.boundingBox())!.height;
  await expect(statusButton).toHaveAccessibleName(/^スレッド自動更新: 追従中/);
  await input.fill(Array.from({ length: 30 }, (_, i) => String(i)).join("\n"));
  await expect
    .poll(async () => (await input.boundingBox())!.height)
    .toBeLessThanOrEqual(maxHeight + 1);
  expect(await input.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await input.fill("");
  await expect
    .poll(async () => (await input.boundingBox())!.height)
    .toBeLessThan(oneLineHeight + 2);
  const submit = panel.getByRole("button", { name: "書き込む" });
  expect(await submit.textContent()).toBe("");
  const trigger = panel.getByRole("button", { name: "その他の操作" });
  expect((await trigger.boundingBox())!.x).toBeGreaterThan((await submit.boundingBox())!.x);
  await trigger.click();
  const menu = page.locator(".write-panel__menu-items");
  await expect(menu).toBeVisible();
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(620);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(700);
  await page.locator(".bottom-panel__header").click();
  await expect(menu).toBeHidden();
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await trigger.click();
  await page.getByRole("button", { name: "書き込み設定" }).click();
  const dialog = page.getByRole("dialog", { name: "書き込み設定" });
  await expect(dialog).toContainText("この板のすべてのスレッドで共有");
  await dialog.getByRole("textbox", { name: "名前" }).fill("テスト名");
  await dialog.getByRole("textbox", { name: "メール" }).fill("sage");
  await dialog.getByRole("button", { name: "閉じる" }).click();
  await trigger.click();
  await page.getByRole("button", { name: "書き込み設定" }).click();
  await expect(dialog.getByRole("textbox", { name: "名前" })).toHaveValue("テスト名");
  await expect(dialog.getByRole("textbox", { name: "メール" })).toHaveValue("sage");
  await page.screenshot({ path: "test-results/write-panel-review.png" });
  await dialog.getByRole("button", { name: "閉じる" }).click();
  const second = localBoard.addLargeThread(5, { id: "1000000999", title: "別のテストスレ" });
  await page.getByTitle("新しいタブ", { exact: true }).click();
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(second.threadUrl);
  await urlInput.press("Enter");
  await waitForThreadLoaded(page, second.threadUrl, 5);
  const secondPanel = page.locator(".bottom-panel");
  if (!(await secondPanel.isVisible()))
    await page.getByRole("button", { name: "書き込みパネルを開閉" }).click();
  await secondPanel.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("button", { name: "書き込み設定" }).click();
  await expect(dialog.getByRole("textbox", { name: "名前" })).toHaveValue("テスト名");
  await expect(dialog.getByRole("textbox", { name: "メール" })).toHaveValue("sage");
});
