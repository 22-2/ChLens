import { expect, test } from "./fixtures.mjs";

test("存在しないレスは灰色、NGレスは赤のアンカーで示す", async ({
  page,
  extensionId,
  localBoard,
}) => {
  localBoard.setDat(
    [
      "名無し<>sage<>2026/10/02 ID:test<>参照 &gt;&gt;2 と &gt;&gt;999<>ローカルテストスレッド",
      "名無し<>sage<>2026/10/02 ID:test<>NG対象の本文<>",
    ].join("\n"),
  );
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.evaluate(() =>
    localStorage.setItem("config_ngwords", 'hide:\n  when body contains "NG対象の本文"'),
  );
  await page.reload();
  await page.getByTestId("title-bar-title").click();
  const input = page.getByPlaceholder("URLを入力");
  await input.fill(localBoard.threadUrl);
  await input.press("Enter");
  const first = page.locator('[data-res-num="1"]');
  const missing = first.locator("a.anchor--missing-target");
  const ng = first.locator("a.anchor--ng-target");
  await expect(missing).toHaveText(">>999");
  await expect(ng).toHaveText(">>2");
  for (const theme of ["light", "dark"]) {
    await page
      .locator(".browser-shell")
      .evaluate((shell, value) => shell.setAttribute("data-theme", value), theme);
    const colors = await first.evaluate((element) => {
      const testColor = (token: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        element.appendChild(probe);
        const result = getComputedStyle(probe).color;
        probe.remove();
        return result;
      };
      return {
        missing: getComputedStyle(element.querySelector(".anchor--missing-target")!).color,
        ng: getComputedStyle(element.querySelector(".anchor--ng-target")!).color,
        muted: testColor("--sys-color-text-muted"),
        error: testColor("--sys-color-error"),
      };
    });
    expect(colors.missing).toBe(colors.muted);
    expect(colors.ng).toBe(colors.error);
  }
});
