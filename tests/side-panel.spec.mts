import { expect, test } from "./fixtures.mjs";

test("サイドパネルの表示とビュー選択を再起動後も復元する", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByRole("button", { name: "サイドパネルを開く" }).click();
  const panel = page.getByRole("complementary", { name: "サイドパネル" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("searchbox", { name: "板名を検索" })).toBeVisible();
  await panel.getByRole("tab", { name: "お気に入り" }).click();
  await expect(panel.getByRole("searchbox", { name: "お気に入りを検索" })).toBeVisible();
  const resize = panel.getByRole("separator", { name: "サイドパネルの幅" });
  const beforeWidth = (await panel.boundingBox())!.width;
  await resize.focus();
  await resize.press("ArrowLeft");
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeGreaterThan(beforeWidth);
  const changedWidth = (await panel.boundingBox())!.width;
  await panel.getByRole("tab", { name: "画像一覧" }).click();
  await panel.getByRole("tab", { name: "画像一覧" }).press("Alt+ArrowLeft");
  await expect(panel.getByRole("tab", { name: "画像一覧" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.reload();
  await expect(panel).toBeVisible();
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(changedWidth);
  await expect(panel.getByRole("tab", { name: "画像一覧" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(panel.getByRole("tab").nth(1)).toHaveAccessibleName("画像一覧");
  await page.getByRole("button", { name: "サイドパネルを閉じる" }).click();
  await expect(panel).toBeHidden();
});
