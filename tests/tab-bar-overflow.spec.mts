import { expect, test } from "./fixtures.mjs";

test("2ペインの垂直タブバーは横にはみ出さず縦にスクロールできる", async ({ page, extensionId }) => {
  await page.addInitScript(() => {
    localStorage.setItem("config_tab_bar_orientation", "vertical");
    localStorage.setItem("config_tab_bar_collapsed", "off");
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  const command = async (name: string) => {
    await page.getByTitle("メニュー", { exact: true }).click();
    await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
    await page.getByPlaceholder("コマンドを検索...").fill(`>${name}`);
    await page.getByRole("option", { name: new RegExp(name, "u") }).click();
  };
  await command("2ペインで表示");
  const bar = page.locator(".tab-bar--vertical.tab-bar--multiple-panes");
  await expect(bar).toBeVisible();
  const handle = bar.getByRole("separator", { name: "タブバーの幅を変更" });
  const initialWidth = (await bar.boundingBox())!.width;
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 12);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 30, handleBox.y + 12, { steps: 4 });
  await page.mouse.up();
  expect((await bar.boundingBox())!.width).toBeGreaterThan(initialWidth);
  for (let i = 0; i < 20; i++) {
    await page.getByRole("button", { name: "新しいタブ", exact: true }).first().click();
  }
  const size = await bar.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    overflowX: getComputedStyle(element).overflowX,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth);
  expect(size.overflowX).toBe("hidden");
  expect(size.scrollHeight).toBeGreaterThan(size.clientHeight);
  await bar.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await bar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await bar.getByRole("button", { name: "簡易表示にする" }).click();
  const collapsed = await bar.evaluate((element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(collapsed.scrollWidth).toBeLessThanOrEqual(collapsed.width);
});
