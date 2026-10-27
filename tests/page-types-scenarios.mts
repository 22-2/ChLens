import { expect, type Page } from "@playwright/test";

/** 実際の登録を使い、ページごとの表示と操作の出し分けを両版で確かめる。 */
export async function verifyBuiltInPages(page: Page): Promise<void> {
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
  await page.getByPlaceholder("コマンドを検索...").fill(">タブバーを垂直にする");
  await page.getByRole("option", { name: /タブバーを垂直にする/u }).click();
  const collapse = page.getByRole("button", { name: "簡易表示にする", exact: true });
  if (await collapse.isVisible()) await collapse.click();

  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  const refresh = page.getByRole("button", { name: "更新", exact: true });
  const filter = page.getByRole("button", { name: "フィルターを開閉", exact: true });
  const verifyPage = async (
    type: string,
    title: string,
    icon: string,
    content: string,
    refreshable: boolean,
    toggleable: boolean,
  ) => {
    await expect(page.getByTestId("title-bar-title")).toHaveAttribute("data-page-type", type);
    await expect(page.getByTestId("title-bar-title")).toHaveText(title);
    await expect(panel.locator(content)).toBeVisible();
    await expect(
      page.getByRole("tab", { selected: true }).locator(`svg.lucide-${icon}`),
    ).toBeVisible();
    if (refreshable) await expect(refresh).toBeEnabled();
    else await expect(refresh).toBeDisabled();
    if (toggleable) {
      await expect(filter).toHaveAttribute("aria-pressed", "false");
      await filter.click();
      await expect(filter).toHaveAttribute("aria-pressed", "true");
      await filter.click();
      await expect(filter).toHaveAttribute("aria-pressed", "false");
    } else {
      await expect(filter).toHaveCount(0);
    }
  };

  await verifyPage("home", "ホーム", "house", ".board-start-page__title", false, false);
  await page.getByRole("button", { name: "板一覧を開く", exact: true }).click();
  await verifyPage("boardList", "板一覧", "list-tree", ".board-list-page", true, true);
  const menu = page.getByRole("button", { name: "テスト板メニュー", exact: true });
  if ((await menu.getAttribute("aria-expanded")) === "false") await menu.click();
  const category = page.getByRole("button", { name: "テストカテゴリ", exact: true });
  if ((await category.getAttribute("aria-expanded")) === "false") await category.click();
  await page.getByText("ローカルテスト板", { exact: true }).click();
  await expect(panel.getByText("ローカルテストスレッド", { exact: true })).toBeVisible();
  await verifyPage(
    "threadList",
    "ローカルテスト板",
    "layout-list",
    ".thread-list-view",
    true,
    false,
  );
  await expect(panel.getByPlaceholder("検索...", { exact: true })).toBeVisible();
  await panel.getByText("ローカルテストスレッド", { exact: true }).click();
  await expect(panel.locator('[data-res-num="2"]')).toBeVisible();
  await verifyPage(
    "thread",
    "ローカルテストスレッド",
    "message-square-text",
    ".thread-page",
    true,
    true,
  );

  for (const [type, title, icon, refreshable] of [
    ["bookmarkList", "ブックマークリスト", "bookmark", false],
    ["historyList", "閲覧履歴", "history", true],
    ["writeHistoryList", "書き込み履歴", "pen-line", true],
    ["logList", "ログ検索", "scroll-text", true],
  ] as const) {
    await page.getByTitle("メニュー", { exact: true }).click();
    await page.getByRole("button", { name: title, exact: true }).click();
    await verifyPage(type, title, icon, ".thread-list-page", refreshable, true);
  }
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await verifyPage("settings", "設定", "settings", ".settings-page__shell", false, false);
}
