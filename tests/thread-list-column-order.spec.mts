import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.mjs";

async function openUrl(page: Page, url: string) {
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(url);
  await urlInput.press("Enter");
}

test("スレ一覧の列順をドラッグで変え、再読み込み後も保つ", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await openUrl(page, localBoard.boardUrl);

  const table = page.locator('.content-area__tab-panel[data-active="true"] .simple-data-table');
  await expect(table).toBeVisible();
  const heatHeader = table.getByRole("columnheader", { name: /勢い/u });
  const titleHeader = table.getByRole("columnheader", { name: /タイトル/u });
  await heatHeader.dragTo(titleHeader, { targetPosition: { x: 1, y: 12 } });

  const labelsBeforeReload = (await table.locator("thead th").allTextContents()).map((label) =>
    label.trim().replace(/[▲▼]/gu, ""),
  );
  expect(labelsBeforeReload.indexOf("勢い")).toBe(labelsBeforeReload.indexOf("タイトル") - 1);

  await page.reload();
  const restoredTable = page.locator(
    '.content-area__tab-panel[data-active="true"] .simple-data-table',
  );
  await expect(restoredTable).toBeVisible();
  const labelsAfterReload = (await restoredTable.locator("thead th").allTextContents()).map(
    (label) => label.trim().replace(/[▲▼]/gu, ""),
  );
  expect(labelsAfterReload).toEqual(labelsBeforeReload);

  await restoredTable.getByRole("row", { name: /ローカルテストスレッド/u }).click();
  const threadListToggle = page.getByRole("button", { name: "スレ一覧パネルを開閉" });
  await expect(threadListToggle).toBeVisible();
  await threadListToggle.click();
  const panelTable = page.locator(".thread-list-panel .simple-data-table");
  await expect(panelTable).toBeVisible();
  const panelLabels = (await panelTable.locator("thead th").allTextContents()).map((label) =>
    label.trim().replace(/[▲▼]/gu, ""),
  );
  expect(panelLabels).toEqual(labelsAfterReload);
});

