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

  // パレットもフォーカス中のペインだけにモード切り替えを届ける。
  const runImageFilter = async () => {
    await page.getByTitle("メニュー", { exact: true }).click();
    await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
    await page.getByPlaceholder("コマンドを検索...").fill(">画像のフィルタ");
    await page.getByRole("option", { name: /画像のフィルタを切り替え/u }).click();
  };
  const leftImage = left.locator(".thread-page__filter-btn").filter({ hasText: "画像" });
  const rightImage = right.locator(".thread-page__filter-btn").filter({ hasText: "画像" });
  await runImageFilter();
  await expect(leftImage).toHaveAttribute("aria-pressed", "true");
  await expect(rightImage).toHaveAttribute("aria-pressed", "false");
  await rightCount.click();
  await expect(rightFilter).toHaveCount(0);
  await runImageFilter();
  await expect(rightImage).toHaveAttribute("aria-pressed", "true");
  await expect(leftImage).toHaveAttribute("aria-pressed", "true");
  await runImageFilter();
  await expect(rightImage).toHaveAttribute("aria-pressed", "false");
  await expect(leftImage).toHaveAttribute("aria-pressed", "true");
}

/** 切り離しと復帰の前後で、それぞれの窓に表示されたタブだけを操作する。 */
export async function verifyDetachedFilters(page: Page, localBoard: LocalBoard): Promise<void> {
  const second = localBoard.addLargeThread(3, { id: "1000000002", title: "別窓のテストスレ" });
  const registrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("ページ操作の二重登録")) {
      registrationErrors.push(message.text());
    }
  });
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(page.locator('[data-res-num="2"]')).toBeVisible();
  await page.getByRole("button", { name: "新しいタブ", exact: true }).click();
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(second.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(page.getByTestId("title-bar-title")).toHaveText(second.title);

  await page.getByTestId("title-bar-title").click({ button: "right" });
  const detach = page.getByRole("button", { name: "別窓で開く", exact: true });
  await expect(detach).toBeVisible();
  const [popup] = await Promise.all([page.context().waitForEvent("page"), detach.click()]);
  await expect(page.getByTestId("title-bar-title")).toHaveText("ローカルテストスレッド");
  await expect(popup.locator('[data-res-num="3"]')).toBeVisible();

  const mainPanel = page.locator('.content-area__tab-panel[data-active="true"]');
  const mainFilter = mainPanel.getByPlaceholder("フィルタする文字を入力");
  const popupFilter = popup.getByPlaceholder("フィルタする文字を入力");
  const mainCount = page.getByRole("button", { name: /^現在のレス数:/u });
  const popupCount = popup.getByRole("button", { name: /^現在のレス数:/u });
  await popupCount.click();
  await expect(popupFilter).toBeVisible();
  await expect(mainFilter).toHaveCount(0);
  await mainCount.click();
  await expect(mainFilter).toBeVisible();
  await expect(popupFilter).toBeVisible();
  await mainCount.click();
  await expect(mainFilter).toHaveCount(0);
  await expect(popupFilter).toBeVisible();

  await popup.getByTestId("title-bar-title").click({ button: "right" });
  await popup.getByRole("button", { name: "メイン画面へ戻す", exact: true }).click();
  await expect(page.getByTestId("title-bar-title")).toHaveText(second.title);
  await expect(mainPanel.locator('[data-res-num="3"]')).toBeVisible();
  await page.getByRole("button", { name: /^現在のレス数:/u }).click();
  await expect(mainFilter).toBeVisible();
  expect(registrationErrors).toEqual([]);
}
