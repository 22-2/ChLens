import { expect, test } from "./fixtures.mjs";

test("スレッドの自動更新をONにすると新着を取得して追従し、OFFにすると取得を止める", async ({
  page,
  extensionId,
  localBoard,
}) => {
  // 既定の20秒では待ち時間が長いため、実行時に許す最短の3秒間隔にする。
  await page.addInitScript(() => {
    localStorage.setItem("auto_load_second", "3000");
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTitle("URLバーを表示", { exact: true }).click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(localBoard.boardUrl);
  await urlInput.press("Enter");

  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await panel.getByText("ローカルテストスレッド", { exact: true }).click();
  const responses = panel.locator(".thread-page__responses");
  await expect(responses.locator("[data-res-num]")).toHaveCount(2);

  const statusButton = page.getByRole("button", { name: /^スレッド自動更新: / });
  await expect(statusButton).toHaveAccessibleName("スレッド自動更新: OFF");
  await statusButton.click();
  const autoRefreshToggle = page
    .locator(".mini-window__toggle-row")
    .filter({ has: page.getByText("自動更新", { exact: true }) })
    .getByRole("button");
  await autoRefreshToggle.click();
  await expect(autoRefreshToggle).toHaveText("ON");

  // ON にした時点で最下部へ寄せ、次の tick で届いた新着をそのまま表示する。
  localBoard.appendPost();
  await expect(responses.locator('[data-res-num="3"]')).toContainText(
    "更新で追加された日本語レス",
    { timeout: 10_000 },
  );
  await expect(responses.locator("[data-res-num]")).toHaveCount(3);
  await expect(statusButton).toHaveAccessibleName(/^スレッド自動更新: 追従中/);

  await autoRefreshToggle.click();
  await expect(autoRefreshToggle).toHaveText("OFF");
  await expect(statusButton).toHaveAccessibleName("スレッド自動更新: OFF");

  // OFF の後は間隔を過ぎても dat を取りに行かない。
  const datRequests = () =>
    localBoard.requests.filter((url) => url === "/local/dat/1000000001.dat").length;
  const requestsAfterOff = datRequests();
  await page.waitForTimeout(4000);
  expect(datRequests()).toBe(requestsAfterOff);
});
