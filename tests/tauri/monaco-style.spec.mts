import { expect, test } from "./fixtures.mts";

test("TauriでMonacoのスタイルとテーマが適用される", async ({ page }) => {
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (
      text.includes("Applying inline style") ||
      text.includes("style-src") ||
      text.includes("font-src")
    ) {
      cspErrors.push(text);
    }
  });

  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await expect(page.locator(".settings-page__shell")).toBeVisible();
  await page.locator(".settings-page__section-btn").filter({ hasText: "NG" }).first().click();
  await page.getByRole("tab", { name: "文字列置換", exact: true }).click();

  const editor = page.locator(".monaco-editor").first();
  await expect(editor).toBeVisible();

  const styleState = await editor.evaluate((element) => {
    const colors = document.querySelector<HTMLStyleElement>("style.monaco-colors");
    return {
      background: getComputedStyle(element).backgroundColor,
      colorStyleRuleCount: colors?.sheet?.cssRules.length ?? 0,
    };
  });

  expect(styleState.colorStyleRuleCount).toBeGreaterThan(0);
  expect(styleState.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(cspErrors).toEqual([]);
});

test("TauriでMonacoの編集面のレイアウト用CSSが適用される", async ({ page }) => {
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await page.locator(".settings-page__section-btn").filter({ hasText: "NG" }).first().click();
  await page.getByRole("tab", { name: "文字列置換", exact: true }).click();

  const editor = page.locator(".monaco-editor").first();
  const overflowGuard = editor.locator(".overflow-guard");
  const lines = editor.locator(".view-lines");
  await expect(editor).toBeVisible();

  // テーマ色は動的なstyle要素でも付くため、別途読み込む編集面のCSSを確認する。
  await expect(overflowGuard).toHaveCSS("overflow", "hidden");
  await expect(overflowGuard).toHaveCSS("position", "relative");
  await expect(lines).toHaveCSS("white-space", "nowrap");
  await expect(editor.locator(".view-line > span").first()).toHaveCSS("position", "absolute");
});
