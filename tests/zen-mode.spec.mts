import { expect, test } from "./fixtures.mjs";

test("Zenモードをコマンドから切り替え、パレットを再び開ける", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  const shell = page.locator(".browser-shell");
  await expect(shell).toBeVisible();

  await page.keyboard.press("Control+Shift+P");
  const commandInput = page.getByPlaceholder("コマンドを検索...");
  await expect(commandInput).toBeVisible();
  await expect(commandInput).toHaveValue("");
  await commandInput.pressSequentially("zen");
  await page.getByRole("option", { name: /Zenモードを開始/u }).click();

  await expect(shell).toHaveAttribute("data-zen-mode", "true");
  await expect(page.locator(".title-bar")).toBeHidden();
  await expect(page.locator(".tab-bar")).toBeHidden();
  await expect(page.locator(".status-bar")).toBeHidden();
  await expect(commandInput).toBeHidden();

  await page.keyboard.press("Control+Shift+P");
  const zenPalette = page.locator(".zen-mode__palette");
  const zenCommandInput = zenPalette.getByPlaceholder("コマンドを検索...");
  await expect(zenCommandInput).toBeVisible();
  await expect(zenCommandInput).toHaveValue("");
  await zenCommandInput.pressSequentially("zen");
  const exitZenModeCommand = page.getByRole("option", { name: /Zenモードを終了/u });
  await expect(exitZenModeCommand).toBeVisible();
  await exitZenModeCommand.click();
  await expect(shell).toHaveAttribute("data-zen-mode", "false");
  await expect(page.locator(".title-bar")).toBeVisible();
  await expect(page.locator(".tab-bar")).toBeVisible();
});

test("オムニバーのルートから各モードに入り戻れる", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  for (const [label, placeholder] of [
    ["お気に入り", "お気に入りを検索..."],
    ["板", "板を検索..."],
    ["閲覧履歴", "閲覧履歴を検索..."],
    ["書き込み履歴", "書き込み履歴を検索..."],
  ]) {
    await page.getByRole("option", { name: new RegExp(`${label}.*モード`) }).click();
    const input = page.getByPlaceholder(placeholder);
    await expect(input).toBeFocused();
    await input.press("Backspace");
    await expect(page.getByPlaceholder("URLを入力")).toBeFocused();
    await expect(page.getByRole("option", { name: new RegExp(`${label}.*モード`) })).toHaveAttribute("aria-selected", "true");
  }
});

test("モードでEscを押すか外側をクリックすると閉じる", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByRole("option", { name: /お気に入り.*モード/ }).click();
  await page.getByPlaceholder("お気に入りを検索...").press("Escape");
  await expect(page.getByPlaceholder("お気に入りを検索...")).toHaveCount(0);
  await page.getByTestId("title-bar-title").click();
  await page.locator(".browser-shell").click({ position: { x: 2, y: 100 } });
  await expect(page.getByPlaceholder("URLを入力")).toHaveCount(0);
});

test("コマンド候補の件数を示し、キーボード選択に合わせてスクロールする", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.keyboard.press("Control+Shift+P");
  const input = page.getByPlaceholder("コマンドを検索...");
  const list = page.getByRole("listbox", { name: "コマンド候補" });
  const options = list.getByRole("option");
  await expect(options.first()).toBeVisible();
  const count = await options.count();
  expect(count).toBeGreaterThan(10);
  await expect(list.getByRole("status")).toHaveText(`${count} / ${count}`);
  for (let index = 0; index < 20; index += 1) await input.press("ArrowDown");
  expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const selected = list.locator('[role="option"][aria-selected="true"]');
  await expect(selected).toBeInViewport();
  const isVisibleInList = await selected.evaluate((element) => {
    const listElement = element.closest('[role="listbox"]')!;
    const item = element.getBoundingClientRect();
    const container = listElement.getBoundingClientRect();
    const footer = listElement.querySelector('.nav-bar__omnibar-count')!.getBoundingClientRect();
    return item.top >= container.top && item.bottom <= footer.top + 1;
  });
  expect(isVisibleInList).toBe(true);
});

test("候補の上でホイールを回しても自動追従がスクロールに重ならない", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.keyboard.press("Control+Shift+P");
  const list = page.getByRole("listbox", { name: "コマンド候補" });
  await expect(list.getByRole("option").first()).toBeVisible();
  const box = (await list.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 50);
  const before = await list.evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 80);
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(before);
  // スクロールに伴うhover処理まで完了してから、余分な移動がないか確認する。
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const after = await list.evaluate((element) => element.scrollTop);
  expect(after - before).toBeCloseTo(80, 0);
});

test("候補の先頭と末尾では矢印キーが折り返さない", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.keyboard.press("Control+Shift+P");
  const input = page.getByPlaceholder("コマンドを検索...");
  const list = page.getByRole("listbox", { name: "コマンド候補" });
  const selected = list.locator('[role="option"][aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  const first = await selected.getAttribute("aria-label");
  await input.press("ArrowUp");
  await expect(selected).toHaveAttribute("aria-label", first!);
  for (let index = 0; index < 60; index += 1) await input.press("ArrowDown");
  const last = await selected.getAttribute("aria-label");
  expect(last).not.toBe(first);
  await input.press("ArrowDown");
  await expect(selected).toHaveAttribute("aria-label", last!);
});
