import { expect, test } from "./fixtures.mjs";

test("サイドパネルの表示とビュー選択を再起動後も復元する", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByRole("button", { name: "サイドパネルを開く" }).click();
  const panel = page.getByRole("complementary", { name: "サイドパネル" });
  await expect(panel).toBeVisible();
  await panel.getByRole("tab", { name: "画像一覧" }).click();
  await panel.getByRole("tab", { name: "画像一覧" }).press("Alt+ArrowLeft");
  await expect(panel.getByRole("tab", { name: "画像一覧" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.reload();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("tab", { name: "画像一覧" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(panel.getByRole("tab").nth(1)).toHaveAccessibleName("画像一覧");
  await page.getByRole("button", { name: "サイドパネルを閉じる" }).click();
  await expect(panel).toBeHidden();
});
