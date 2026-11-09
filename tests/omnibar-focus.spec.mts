import { expect, test } from "./fixtures.mjs";

test("タイトルバーをクリックすると現在のURLを選択表示し、候補は絞り込まない", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(page.locator('[data-res-num="2"]')).toBeVisible();

  await page.getByTestId("title-bar-title").click();
  const input = page.getByPlaceholder("URLを入力");
  await expect(input).toHaveValue(localBoard.threadUrl);
  const selected = await input.evaluate((element: HTMLInputElement) =>
    element.value.slice(element.selectionStart ?? 0, element.selectionEnd ?? 0),
  );
  expect(selected).toBe(localBoard.threadUrl);
  // 入力するまで絞り込まれず、モード一覧が見える。
  await expect(page.getByText("コマンド", { exact: true }).first()).toBeVisible();
});
