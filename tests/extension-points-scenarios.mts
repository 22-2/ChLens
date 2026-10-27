import { expect, type Page } from "@playwright/test";

import type { startLocalBoard } from "./localboard.mjs";

type LocalBoard = Awaited<ReturnType<typeof startLocalBoard>>;

/** 両版で、同時に表示している2つのスレの操作対象が混ざらないことを確認する。 */
export async function verifyTwoPaneFilters(page: Page, localBoard: LocalBoard): Promise<void> {
  const second = localBoard.addLargeThread(3, { id: "1000000002", title: "二つ目のテストスレ" });
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(page.locator('[data-res-num="2"]')).toBeVisible();

  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
  await page.getByPlaceholder("コマンドを検索...").fill(">2ペインで表示");
  await page.getByRole("option", { name: /2ペインで表示/u }).click();

  const panes = page.locator(".pane-column");
  await expect(panes).toHaveCount(2);
  const left = panes.nth(0);
  const right = panes.nth(1);
  await expect(right).toHaveAttribute("data-active", "true");
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(second.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(right.locator('[data-res-num="3"]')).toBeVisible();
  await expect(left.locator('[data-res-num="2"]')).toContainText("二番目の日本語レス");

  const leftFilter = left.getByPlaceholder("フィルタする文字を入力");
  const rightFilter = right.getByPlaceholder("フィルタする文字を入力");
  const leftCount = left.getByRole("button", { name: /^現在のレス数:/u });
  const rightCount = right.getByRole("button", { name: /^現在のレス数:/u });
  await expect(leftFilter).toHaveCount(0);
  await expect(rightFilter).toHaveCount(0);
  await leftCount.click();
  await expect(leftFilter).toBeVisible();
  await expect(rightFilter).toHaveCount(0);
  await rightCount.click();
  await expect(rightFilter).toBeVisible();
  await expect(leftFilter).toBeVisible();
  await leftCount.click();
  await expect(leftFilter).toHaveCount(0);
  await expect(rightFilter).toBeVisible();
}
