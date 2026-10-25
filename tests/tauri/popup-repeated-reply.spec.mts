import { expect, test } from "./fixtures.mjs";

test("返信ツリーとIDポップアップで同じ宛先への複数返信IDを強調する", async ({
  page,
  localBoard,
}) => {
  localBoard.setDat(
    [
      "名無し<>sage<>2026/10/25 ID:root<>起点レス<>ローカルテストスレッド",
      "返信者<>sage<>2026/10/25 ID:repeat<>通常の返信 &gt;&gt;1<>",
      "返信者<>sage<>2026/10/25 ID:repeat<>二度目の返信 &gt;&gt;1<>",
      "返信者<>sage<>2026/10/25 ID:repeat<>別の宛先 &gt;&gt;2<>",
    ].join("\n"),
  );
  await page.getByTestId("title-bar-title").click();
  const input = page.getByPlaceholder("URLを入力");
  await input.fill(localBoard.threadUrl);
  await input.press("Enter");
  const responses = page.locator(
    '.content-area__tab-panel[data-active="true"] .thread-page__responses',
  );
  await expect(responses.locator('[data-res-num="4"]')).toContainText("別の宛先");
  await expect(responses.locator(".res__id--repeated-reply")).toHaveCount(0);
  await responses.locator('[data-res-num="1"] .res__rep').click();
  const popup = page.locator(".res-popup");
  await expect(popup.locator(".res__id--repeated-reply")).toHaveCount(2);
  const emphasis = popup.locator(".res__id--repeated-reply").first();
  expect(await emphasis.evaluate((element) => getComputedStyle(element).fontWeight)).toBe("700");
  expect(await emphasis.evaluate((element) => getComputedStyle(element).textDecorationStyle)).toBe(
    "double",
  );
  await page.screenshot({ path: test.info().outputPath("repeated-reply.png") });
  await popup.getByRole("button", { name: "閉じる", exact: true }).click();
  await responses.locator('[data-res-num="2"] .res__id').click();
  await expect(popup.locator(".res__id--repeated-reply")).toHaveCount(2);
  // ID全体の投稿数は既存の値を維持する。
  await expect(popup.locator(".res__id").first()).toContainText("(3)");
});
