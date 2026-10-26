import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.mjs";

async function openUrl(page: Page, url: string) {
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(url);
  await urlInput.press("Enter");
}

test("dat落ち通知は類似検索に次スレも含め、コマンドの次スレ検索は候補を絞る", async ({
  page,
  extensionId,
  localBoard,
}) => {
  localBoard.setThreads([
    {
      id: "1000000001",
      title: "ローカル実況 Part.1",
      posts: [
        "名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>前スレのレス<>ローカル実況 Part.1",
      ],
    },
    {
      id: "1000000002",
      title: "ローカル実況 Part.2",
      posts: [
        "名無し<>sage<>2026/10/02(金) 12:01:00 ID:local002<>次スレのレス<>ローカル実況 Part.2",
      ],
    },
    {
      id: "1000000003",
      title: "ローカル実況 Part.5",
      posts: [
        "名無し<>sage<>2026/10/02(金) 12:02:00 ID:local003<>別の回のレス<>ローカル実況 Part.5",
      ],
    },
  ]);
  localBoard.setThreadSubjectVisible("1000000001", false);

  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await openUrl(page, localBoard.threadUrl);
  const activePanel = page.locator('.content-area__tab-panel[data-active="true"]');
  await expect(page.getByTestId("title-bar-title")).toHaveText("ローカル実況 Part.1");
  await expect(activePanel.getByText("このスレッドはdat落ちしています")).toBeVisible();
  await expect(activePanel.locator(".thread-page__notice--expired button")).toHaveCount(1);

  await activePanel.getByRole("button", { name: "類似スレを探す" }).click();
  const similarDialog = page.getByRole("dialog");
  const similarResults = similarDialog.getByRole("list", {
    name: "類似スレ・次スレ候補一覧",
  });
  await expect(
    similarResults.getByRole("button", { name: "ローカル実況 Part.2へ移動" }),
  ).toBeVisible();
  await expect(
    similarResults.getByRole("button", { name: "ローカル実況 Part.5へ移動" }),
  ).toBeVisible();
  await similarDialog.getByRole("button", { name: "閉じる" }).click();

  // 次スレ検索の操作は通知から外したため、通知にボタンがないことと、コマンドの次スレ検索が候補を絞ることを確かめる。
  await expect(activePanel.getByRole("button", { name: "次スレを探す" })).toHaveCount(0);
  await page.keyboard.press("Control+Shift+P");
  await page.getByPlaceholder("コマンドを検索...").fill(">次スレ候補を検索");
  await page.getByRole("option", { name: /次スレ候補を検索/u }).click();
  const nextDialog = page.getByRole("dialog");
  const nextResults = nextDialog.getByRole("list", { name: "次スレ候補一覧" });
  const nextCandidate = nextResults.getByRole("button", { name: "ローカル実況 Part.2へ移動" });
  await expect(nextCandidate).toBeVisible();
  await expect(nextResults.getByRole("button", { name: "ローカル実況 Part.5へ移動" })).toHaveCount(
    0,
  );
  await nextCandidate.click();
  await expect(page.getByTestId("title-bar-title")).toHaveText("ローカル実況 Part.2");
  await expect(
    page.locator('.content-area__tab-panel[data-active="true"] [data-res-num="1"]'),
  ).toContainText("次スレのレス");
});
