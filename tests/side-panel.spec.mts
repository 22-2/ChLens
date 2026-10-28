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

test("書き込み欄を下部とサイドの間で移しても下書きを保つ", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const thread = localBoard.addLargeThread(10);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 10);

  await page.getByRole("button", { name: "書き込みパネルを開閉" }).click();
  const bottomEditor = page.locator(".bottom-panel .write-panel__textarea");
  await expect(bottomEditor).toBeVisible();
  await bottomEditor.fill("移動前の下書き");

  await page.getByRole("button", { name: "サイドパネルを開く" }).click();
  const panel = page.getByRole("complementary", { name: "サイドパネル" });
  await panel.getByRole("tab", { name: "書き込み" }).click();
  await expect(panel.getByText("書き込み欄は下部パネルで開いています。")).toBeVisible();
  await panel.getByRole("button", { name: "こちらに移動" }).click();

  // 編集欄は1か所だけにし、移った先で同じ下書きを続けて編集できる。
  const sideEditor = panel.locator(".write-panel__textarea");
  await expect(sideEditor).toHaveValue("移動前の下書き");
  await expect(bottomEditor).toHaveCount(0);
  await expect(page.locator(".bottom-panel")).toContainText(
    "書き込み欄はサイドパネルで開いています。",
  );

  await page.locator(".bottom-panel").getByRole("button", { name: "こちらに移動" }).click();
  await expect(bottomEditor).toHaveValue("移動前の下書き");
  await expect(panel.getByText("書き込み欄は下部パネルで開いています。")).toBeVisible();
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

test("タブを右端までドラッグしても狭いプロパティ表示が横にはみ出さない", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const thread = localBoard.addLargeThread(150);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 150);
  await page.getByRole("button", { name: "サイドパネルを開く" }).click();
  const panel = page.getByRole("complementary", { name: "サイドパネル" });
  await panel.getByRole("tab", { name: "スレプロパティ" }).click();
  const resize = panel.getByRole("separator", { name: "サイドパネルの幅" });
  await resize.focus();
  for (let i = 0; i < 6; i++) await resize.press("ArrowRight");
  const body = panel.locator(".side-panel__body");
  const tabs = panel.getByRole("tablist", { name: "サイドパネルのビュー" });
  const source = panel.getByRole("tab", { name: "板一覧" });
  const last = panel.getByRole("tab", { name: "書き込み" });
  const box = (await source.boundingBox())!;
  const end = (await last.boundingBox())!;
  await expect.poll(() => body.evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width + 50, end.y + end.height / 2, { steps: 20 });
  await expect(panel.locator(".side-panel__tab--dragging").first()).toBeVisible();
  await expect.poll(() => body.evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
  await page.mouse.up();
  await expect.poll(() => body.evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
  await expect.poll(() => tabs.evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
});
