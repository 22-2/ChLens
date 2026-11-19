import { expect, test } from "./fixtures.mjs";

test("返信ツリー内のIDから子ポップアップを開ける", async ({ page, extensionId, localBoard }) => {
  localBoard.setDat(
    [
      "名無し<>sage<>2026/10/25 ID:root<>起点レス<>ローカルテストスレッド",
      "返信者<>sage<>2026/10/25 ID:repeat<>通常の返信 &gt;&gt;1<>",
      "返信者<>sage<>2026/10/25 ID:repeat<>二度目の返信 &gt;&gt;1<>",
    ].join("\n"),
  );
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  const responses = page.locator(
    '.content-area__tab-panel[data-active="true"] .thread-page__responses',
  );
  await expect(responses.locator('[data-res-num="3"]')).toContainText("二度目の返信");
  await responses.locator('[data-res-num="1"] .res__rep').click();
  const parent = page.locator('.res-popup[data-popup-id^="tree"]');
  await expect(parent).toBeVisible();
  const idLink = parent.locator(".res__id").last();
  const idBox = (await idLink.boundingBox())!;
  await idLink.click();
  const child = page.locator('.res-popup:not([data-popup-id^="tree"])');
  await expect(page.locator(".res-popup")).toHaveCount(2);
  await expect(child).toContainText("ID:repeat");
  // 親の上端ではなく、押したIDの直下に表示する。
  const childBox = (await child.boundingBox())!;
  const parentBox = (await parent.boundingBox())!;
  expect(childBox.y).toBeGreaterThanOrEqual(idBox.y);
  expect(childBox.y).toBeLessThan(idBox.y + idBox.height + 40);
  expect(childBox.x).toBeGreaterThan(parentBox.x);
});

test("返信ツリーの三点メニューはレスヘッダーと重ならない", async ({
  page,
  extensionId,
  localBoard,
}) => {
  localBoard.setDat(
    [
      "名無し<>sage<>2026/10/25 ID:root<>起点レス<>ローカルテストスレッド",
      "返信者<>sage<>2026/10/25 ID:repeat<>通常の返信 &gt;&gt;1<>",
      "返信者<>sage<>2026/10/25 ID:repeat<>二度目の返信 &gt;&gt;1<>",
    ].join("\n"),
  );
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  const responses = page.locator(
    '.content-area__tab-panel[data-active="true"] .thread-page__responses',
  );
  await expect(responses.locator('[data-res-num="3"]')).toContainText("二度目の返信");
  await responses.locator('[data-res-num="1"] .res__rep').click();

  const tree = page.locator('.res-popup[data-popup-id^="tree"]');
  const node = tree.locator(".reply-tree-node").first();
  await expect(node).toBeVisible();
  await node.hover();
  const menuButton = node.locator(".reply-tree-node__menu-btn");
  await expect(menuButton).toBeVisible();
  const menuBox = (await menuButton.boundingBox())!;
  // ヘッダーの内容（日時や返信数）の右端が、ボタンの左端より左にあること。
  const headerContentRight = await node
    .locator(".res__header")
    .evaluate((header) =>
      Math.max(...Array.from(header.children).map((child) => child.getBoundingClientRect().right)),
    );
  expect(headerContentRight).toBeLessThanOrEqual(menuBox.x);
});

test("固定したポップアップは寸法を保ち、リサイズと画面外への移動ができる", async ({
  page,
  extensionId,
  localBoard,
}) => {
  localBoard.setDat(
    [
      "名無し<>sage<>2026/10/25 ID:root<>起点レス<>ローカルテストスレッド",
      "返信者<>sage<>2026/10/25 ID:reply<>返信 &gt;&gt;1<>",
    ].join("\n"),
  );
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  const responses = page.locator(
    '.content-area__tab-panel[data-active="true"] .thread-page__responses',
  );
  await expect(responses.locator('[data-res-num="2"]')).toContainText("返信");

  for (const kind of ["tree", "id", "anchor"] as const) {
    if (kind === "tree") await responses.locator('[data-res-num="1"] .res__rep').click();
    if (kind === "id") await responses.locator('[data-res-num="1"] .res__id').click();
    if (kind === "anchor") await responses.locator('[data-res-num="2"] a.anchor').hover();
    const popup = page.locator(kind === "anchor" ? ".anchor-preview" : ".res-popup");
    await expect(popup).toBeVisible();
    const before = (await popup.boundingBox())!;
    await popup.getByRole("button", { name: "ピン留め", exact: true }).click();
    const pinned = (await popup.boundingBox())!;
    expect(pinned.width).toBeCloseTo(before.width, 1);
    expect(pinned.height).toBeCloseTo(before.height, 1);

    const grip = (await popup.locator("[data-popup-resize]").boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 120, grip.y + grip.height / 2 + 80);
    await page.mouse.up();
    const resized = (await popup.boundingBox())!;
    expect(resized.width).toBeCloseTo(before.width + 120, 1);
    expect(resized.height).toBeCloseTo(before.height + 80, 1);

    const header = (await popup.locator(".res-popup__header").boundingBox())!;
    await page.mouse.move(header.x + 20, header.y + header.height / 2);
    await page.mouse.down();
    await page.mouse.move(1, header.y + header.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await popup.boundingBox())!.x).toBeLessThan(0);
    // 寸法監視や再描画が位置を画面内へ戻さないことも確認する。
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    expect((await popup.boundingBox())!.x).toBeLessThan(0);
    await popup.getByRole("button", { name: "閉じる", exact: true }).click();
  }
});
