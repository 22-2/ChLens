import { expect, test } from "./fixtures.mjs";

for (const theme of ["light", "dark"] as const) {
  test(`アイコンボタンの状態を ${theme} テーマで揃える`, async ({
    page,
    extensionId,
    localBoard,
  }, testInfo) => {
    const thread = localBoard.addLargeThread(5);
    await page.goto(`chrome-extension://${extensionId}/view/index.html`);
    await page.getByTestId("title-bar-title").click();
    await page.getByPlaceholder("URLを入力").fill(thread.threadUrl);
    await page.getByPlaceholder("URLを入力").press("Enter");
    await expect(page.locator('[data-res-num="1"]')).toBeVisible();
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
      document.querySelector<HTMLElement>(".browser-shell")!.dataset.theme = theme;
    }, theme);
    await page.addStyleTag({ content: ".icon-button { transition: none !important; }" });
    const filter = page.getByRole("button", { name: "フィルターを開閉" });
    const panel = page.getByRole("button", { name: "サイドパネルを開く" });
    const forward = page.getByRole("button", { name: "進む", exact: true }).first();
    const style = (element: Element) => {
      const css = getComputedStyle(element);
      return { color: css.color, background: css.backgroundColor };
    };
    const normal = await filter.evaluate(style);
    expect(await panel.evaluate(style)).toEqual(normal);
    await filter.hover();
    const hover = await filter.evaluate(style);
    expect(hover).not.toEqual(normal);
    await filter.click();
    await expect(filter).toHaveAttribute("aria-pressed", "true");
    const activeHover = await filter.evaluate(style);
    await page.mouse.move(0, 0);
    const active = await filter.evaluate(style);
    expect(active.color).not.toEqual(normal.color);
    expect(activeHover.color).toEqual(active.color);
    expect(activeHover.background).not.toEqual(active.background);
    const originalIcon = await panel.locator("svg").evaluate((svg) => svg.outerHTML);
    await panel.click();
    const openPanel = page.getByRole("button", { name: "サイドパネルを閉じる" });
    await expect(openPanel).toHaveAttribute("aria-expanded", "true");
    expect(await openPanel.locator("svg").evaluate((svg) => svg.outerHTML)).toBe(originalIcon);
    expect(await openPanel.evaluate(style)).toEqual(activeHover);
    await page.mouse.move(0, 0);
    expect(await openPanel.evaluate(style)).toEqual(active);
    await expect(forward).toBeDisabled();
    const disabled = await forward.evaluate(style);
    await forward.hover({ force: true });
    expect(await forward.evaluate(style)).toEqual(disabled);
    expect(disabled.color).not.toEqual(normal.color);
    await filter.evaluate((element: HTMLButtonElement) => {
      element.disabled = true;
    });
    await filter.hover({ force: true });
    expect(await filter.evaluate(style)).toEqual(disabled);
    await filter.evaluate((element: HTMLButtonElement) => {
      element.disabled = false;
    });
    await filter.hover();
    await page.screenshot({ path: testInfo.outputPath(`icon-buttons-${theme}.png`) });
  });
}
