import { verifyDetachedFilters, verifyTwoPaneFilters } from "./extension-points-scenarios.mjs";
import { expect, test } from "./fixtures.mjs";

test("板からスレへの遷移と再読み込み後もフィルターが対象ページで動く", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const second = localBoard.addLargeThread(3, { id: "1000000002", title: "二つ目のテストスレ" });
  const registrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("ページ操作の二重登録"))
      registrationErrors.push(message.text());
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  const url = page.getByPlaceholder("URLを入力");
  await url.fill(localBoard.boardUrl);
  await url.press("Enter");
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await expect(panel.getByText("ローカルテストスレッド", { exact: true })).toBeVisible();
  // スレ一覧では検索バーを常設し、開閉ボタンを表示しない。
  await expect(panel.getByPlaceholder("検索...", { exact: true })).toBeVisible();
  await panel.getByText("ローカルテストスレッド", { exact: true }).click();
  await expect(panel.locator('[data-res-num="1"]')).toBeVisible();
  const toggle = page.getByRole("button", { name: "フィルターを開閉", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("title-bar-title").click();
  await url.fill(second.threadUrl);
  await url.press("Enter");
  await expect(page.getByTestId("title-bar-title")).toHaveText("二つ目のテストスレ");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(panel.locator('[data-res-num="1"]')).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // パレット経由のモード操作も同じタブへ届き、再選択で解除される。
  const runImageFilter = async () => {
    await page.getByTitle("メニュー", { exact: true }).click();
    await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
    await page.getByPlaceholder("コマンドを検索...").fill(">画像のフィルタ");
    await page.getByRole("option", { name: /画像のフィルタを切り替え/ }).click();
  };
  await runImageFilter();
  await expect(
    panel.locator(".thread-page__filter-btn").filter({ hasText: "画像" }),
  ).toHaveAttribute("aria-pressed", "true");
  await runImageFilter();
  await expect(
    panel.locator(".thread-page__filter-btn").filter({ hasText: "画像" }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(registrationErrors).toEqual([]);
});

test("2ペインでフィルター操作がそれぞれのスレに届く", async ({ page, extensionId, localBoard }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await verifyTwoPaneFilters(page, localBoard);
});

test("別窓への移動と復帰後もフィルター操作が対象のスレに届く", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await verifyDetachedFilters(page, localBoard);
});
