import { expect, test } from "./fixtures.mjs";

test("NGエディタの新構文でOR・AND・除外・適用先を保存し、スレ一覧とレスへ反映する", async ({
  page,
  extensionId,
  localBoard,
}, testInfo) => {
  localBoard.setDat(
    [
      "名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>対象の本文<>ローカルテストスレッド",
      "名無し<>sage<>2026/10/02(金) 12:01:00 ID:local002<>対象の本文<>",
      "名無し<>sage<>2026/10/02(金) 12:02:00 ID:local003<>通常の本文<>",
    ].join("\n"),
  );
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTitle("URLバーを表示", { exact: true }).click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(localBoard.threadUrl);
  await urlInput.press("Enter");
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  const first = panel.locator('[data-res-num="1"]');
  const second = panel.locator('[data-res-num="2"]');
  const third = panel.locator('[data-res-num="3"]');
  await expect(first).toContainText("対象の本文");
  await expect(second).toContainText("対象の本文");
  await expect(third).toContainText("通常の本文");

  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await panel.getByRole("button", { name: /^NG/ }).click();
  const editingSurface = panel.locator(".monaco-editor .view-lines");
  await expect(editingSurface).toBeVisible();
  // 空のNative EditContextは0サイズなので、ユーザーと同じ編集面から入力する。
  await editingSurface.click({ position: { x: 10, y: 10 } });
  await page.keyboard.insertText("hide:\n  when body contains bare");
  await expect(panel.getByText("NGルールを保存できません", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("config_ngwords"))).toBe("");
  const sites = new URL(localBoard.origin).hostname;
  const rule = `highlight:
  color blue
  label "注目"
  sites "${sites}"
  when title contains:
    "ローカル"
    "別のタイトル"
  when res-count >= 3
  unless title contains "除外"

hide:
  sites "${sites}"
  when body contains:
    "対象"
    "宣伝"
  unless id contains "local001"`;
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(rule);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("config_ngwords")?.replace(/\r\n/gu, "\n")),
    )
    .toBe(rule);
  await expect(panel.getByText("NGルールを保存できません", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "NG記法例", exact: true }).click();
  await expect(panel.locator(".dsl-editor__snippet")).toHaveCount(2);
  await panel.getByRole("tab", { name: "文字列置換", exact: true }).click();
  await panel.getByRole("tab", { name: "NGルール", exact: true }).click();
  await expect(editingSurface).toContainText("unless id contains");
  await page.reload();
  await expect(panel.getByRole("tab", { name: "NGルール", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(editingSurface).toContainText("unless id contains");
  await page.screenshot({ path: testInfo.outputPath("ng-dsl-settings.png"), fullPage: true });

  await page.getByRole("tab", { name: "ローカルテストスレッド", exact: true }).click();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(first).toBeVisible();
  await expect(second).toBeHidden();
  await expect(third).toBeVisible();
  await page.reload();
  await expect(first).toBeVisible();
  await expect(second).toBeHidden();
  await expect(third).toBeVisible();

  // 同じルール群をスレ一覧で評価し、titleとレス数のANDで色・ラベルを付ける。
  await urlInput.fill(localBoard.boardUrl);
  await urlInput.press("Enter");
  await expect(panel.getByText("ローカルテストスレッド", { exact: true })).toBeVisible();
  await expect(panel.getByText("注目（1）", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ng-dsl-thread-list.png"), fullPage: true });
});
