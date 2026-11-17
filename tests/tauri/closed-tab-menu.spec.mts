import { expect, test } from "./fixtures.mjs";

test("閉じたタブの履歴を中クリックと左クリックで開く", async ({ page, localBoard }) => {
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(page.locator('[data-res-num="2"]')).toBeVisible();
  await page.getByTitle("新しいタブ", { exact: true }).click();
  await page.getByRole("tab", { name: "ローカルテストスレッド" }).click({ button: "middle" });

  const historyItem = page.getByRole("button", { name: "ローカルテストスレッド", exact: true });
  const openHistory = async () => {
    await page.getByRole("tab").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "閉じたタブを開く", exact: true }).hover();
    await expect(historyItem).toBeVisible();
  };
  await openHistory();
  await historyItem.click({ button: "middle" });
  await expect(page.getByTestId("title-bar-title")).toHaveText("ホーム");
  await expect(page.getByRole("tab", { name: "ローカルテストスレッド" })).toBeVisible();
  await openHistory();
  await historyItem.click();
  await expect(page.getByTestId("title-bar-title")).toHaveText("ローカルテストスレッド");
});
