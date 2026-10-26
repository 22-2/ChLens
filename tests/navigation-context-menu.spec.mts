import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.mjs";

async function openUrl(page: Page, url: string) {
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(url);
  await urlInput.press("Enter");
}

test("ナビゲーション候補の右クリックからスレと板の操作を実行する", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await openUrl(page, localBoard.boardUrl);

  const activePanel = page.locator('.content-area__tab-panel[data-active="true"]');
  const threadTitle = activePanel.getByText("ローカルテストスレッド", { exact: true });
  await expect(threadTitle).toBeVisible();
  await threadTitle.click();
  await expect(activePanel.locator('[data-res-num="1"]')).toContainText("最初の日本語レス");
  await openUrl(page, localBoard.boardUrl);
  await page.reload();

  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill("ローカルテストスレッド");
  const threadSuggestion = page
    .getByRole("option")
    .filter({ hasText: "ローカルテストスレッド" })
    .first();
  await expect(threadSuggestion).toBeVisible();
  await threadSuggestion.click({ button: "right" });
  await expect(page.getByRole("button", { name: "URLをコピー", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "スレログを削除してタブを閉じる" }).click();

  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill("ローカルテスト板");
  const boardSuggestion = page.getByRole("option").filter({ hasText: "ローカルテスト板" }).first();
  await expect(boardSuggestion).toBeVisible();
  await boardSuggestion.click({ button: "right" });
  await expect(page.getByRole("button", { name: "板名をコピー" })).toBeVisible();
  await page.getByRole("button", { name: "このタブで開く" }).click();
  await expect(
    page
      .locator('.content-area__tab-panel[data-active="true"]')
      .getByText("ローカルテストスレッド", {
        exact: true,
      }),
  ).toBeVisible();
});

