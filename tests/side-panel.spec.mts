import { expect, test } from "./fixtures.mjs";
import { openThreadFromBoard, waitForThreadLoaded } from "./thread-scroll-helpers.mjs";

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

test("抽出結果を強調し、本文のレスへ移動する", async ({ page, extensionId, localBoard }) => {
  const thread = localBoard.addLargeThread(150);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 150);
  await page.getByRole("button", { name: "サイドパネルを開く" }).click();
  const panel = page.getByRole("complementary", { name: "サイドパネル" });
  await panel.getByRole("tab", { name: "抽出レス" }).click();
  const search = panel.getByRole("searchbox", { name: "レスを抽出" });
  await expect(panel.locator(".side-panel__response")).toHaveCount(0);
  await search.fill("レス本文マーカー42");
  await expect(panel.locator("mark")).toHaveText("レス本文マーカー42");
  await panel.getByRole("button", { name: /レス本文マーカー42/ }).click();
  await expect(page.locator('.content-area__tab-panel[data-active="true"]')).toContainText(
    "レス本文マーカー42",
  );
});

test("画像一覧は手動取得の設定に従い、取得した画像をビューアーで開く", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const imageUrl = `${localBoard.origin}/img/1.png`;
  localBoard.setDat(
    [
      `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>画像なし<>ローカルテストスレッド`,
      `名無し<>sage<>2026/10/02(金) 12:01:00 ID:local002<>画像のレス ${imageUrl}<>`,
    ].join("\n"),
  );
  await page.addInitScript(() => {
    localStorage.setItem("config_manual_image_loading", "on");
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(localBoard.threadUrl);
  await urlInput.press("Enter");
  await expect(page.locator('[data-res-num="2"]')).toContainText("画像のレス");

  await page.getByRole("button", { name: "サイドパネルを開く" }).click();
  const panel = page.getByRole("complementary", { name: "サイドパネル" });
  await panel.getByRole("tab", { name: "画像一覧" }).click();
  await expect(panel.getByText("1 件")).toBeVisible();
  expect(localBoard.requests).not.toContain("/img/1.png");

  await panel.getByRole("button", { name: "画像を読み込む: >>2 の画像" }).click();
  await expect(panel.locator(`img[src="${imageUrl}"]`)).toBeVisible();
  await panel.getByRole("button", { name: ">>2 の画像を拡大" }).click();
  await expect(page.locator(".media-viewer__label")).toHaveText(imageUrl);
});

test("スレプロパティに表示中のスレの情報を出す", async ({ page, extensionId, localBoard }) => {
  const thread = localBoard.addLargeThread(150);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 150);
  await page.getByRole("button", { name: "サイドパネルを開く" }).click();
  const panel = page.getByRole("complementary", { name: "サイドパネル" });
  await panel.getByRole("tab", { name: "スレプロパティ" }).click();
  const property = (label: string) =>
    panel.locator(".side-panel__property").filter({ has: page.getByText(label, { exact: true }) });
  await expect(property("レス数").locator("dd")).toHaveText("150");
  await expect(property("状態").locator("dd")).toHaveText("取得済み");
  await expect(panel.getByRole("img", { name: "勢い推移グラフ" })).toBeVisible();
});
