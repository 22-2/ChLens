import { expect, test } from "./fixtures.mjs";

test("実況中もアンカーポップアップで取得を待機し、閉じたら再開する", async ({
  page,
  localBoard,
  tauri,
}) => {
  await page.evaluate(() => {
    localStorage.setItem("config_auto_load_second", "3000");
    localStorage.setItem("config_pause_auto_scroll_on_popup", "true");
    localStorage.setItem("config_thread_display_mode", "live-chat");
  });
  await page.reload();
  localBoard.setDat(
    [
      "名無し<>sage<>2026/10/25 ID:root<>起点レス<>ローカルテストスレッド",
      "返信者<>sage<>2026/10/25 ID:reply<>返信 &gt;&gt;1<>",
    ].join("\n"),
  );
  await page.getByTestId("title-bar-title").click();
  const input = page.getByPlaceholder("URLを入力");
  await input.fill(localBoard.threadUrl);
  await input.press("Enter");
  const responses = page.locator(
    '.content-area__tab-panel[data-active="true"] .thread-page__responses',
  );
  await expect(responses.locator('[data-res-num="2"]')).toContainText("返信");
  const overlayControl = page
    .locator(".status-bar")
    .getByRole("button", { name: /コメントOverlay制御/u });
  await overlayControl.click();
  const flowSwitch = page
    .locator(".mini-window__toggle-row")
    .filter({ hasText: "コメントを画面に流す" })
    .locator(".mini-window__switch");
  await flowSwitch.click();
  await expect(flowSwitch).toHaveAttribute("aria-pressed", "true");
  await tauri.window("overlay");
  await page.locator(".mini-window__close").click();
  const status = page.getByRole("button", { name: /^スレッド自動更新: / });
  await status.click();
  await page
    .locator(".mini-window__toggle-row")
    .filter({ has: page.getByText("自動更新", { exact: true }) })
    .getByRole("button")
    .click();
  await page.locator(".mini-window__close").click();
  await expect(status).not.toHaveAccessibleName("スレッド自動更新: OFF");
  const datRequests = () =>
    localBoard.requests.filter((url) => url === "/local/dat/1000000001.dat").length;
  await responses.locator('[data-res-num="2"] a.anchor').hover();
  const popup = page.locator(".anchor-preview");
  await expect(popup).toBeVisible();
  const pin = popup.getByRole("button", { name: "ピン留め", exact: true });
  await expect(pin.locator("+ button")).toHaveAttribute(
    "aria-label",
    "アンカーポップアップメニュー",
  );
  await pin.click();
  await expect(popup.getByRole("button", { name: "ピン留めを解除" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(status).toHaveAccessibleName(/一時停止中/);
  // 開く直前から進行中の取得は完了を待ち、新しい周期の取得だけを数える。
  await page.waitForTimeout(500);
  const pausedRequests = datRequests();
  localBoard.appendPost();
  await page.waitForTimeout(6500);
  expect(datRequests()).toBe(pausedRequests);
  await expect(responses.locator('[data-res-num="3"]')).toHaveCount(0);
  // 子ツリーだけ閉じても、固定した親アンカーが残る間は再開しない。
  await popup.locator(".res__rep").click();
  const child = page.locator(".res-popup");
  await expect(child).toBeVisible();
  await child.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(popup).toBeVisible();
  await expect(status).toHaveAccessibleName(/一時停止中/);
  expect(datRequests()).toBe(pausedRequests);
  await popup.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect.poll(datRequests, { timeout: 7000 }).toBeGreaterThan(pausedRequests);
  await expect(responses.locator('[data-res-num="3"]')).toBeVisible({ timeout: 7000 });
  // 別タブへ移ったら、以前のポップアップ状態でOverlayの取得を止めない。
  await responses.locator('[data-res-num="2"] a.anchor').hover();
  await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: "ピン留め", exact: true }).click();
  await page.getByTestId("title-bar-title").click();
  await input.fill(localBoard.boardUrl);
  await input.press("Enter");
  await expect(page.getByRole("tab", { name: /ローカルテスト板/ })).toBeVisible();
  const requestsOnOtherTab = datRequests();
  await expect.poll(datRequests, { timeout: 7000 }).toBeGreaterThan(requestsOnOtherTab);
  await page.getByRole("tab", { name: /ローカルテストスレッド/ }).click();
  // テスト用Overlayを明示的に停止してからアプリを終了する。
  await overlayControl.click();
  await flowSwitch.click();
  await expect(flowSwitch).toHaveAttribute("aria-pressed", "false");
});
