import { expect, test } from "./fixtures.mjs";

test("collapseに書いたlabelを、スレ一覧で折りたたんだスレの見出しに使う", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "config_ngwords",
      'collapse:\n  label "定期スレ"\n  when title contains "ローカル"',
    );
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  const input = page.getByPlaceholder("URLを入力");
  await input.fill(localBoard.boardUrl);
  await input.press("Enter");
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await expect(panel.getByRole("button", { name: /定期スレ（1）/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: /折りたたんだスレ/ })).toHaveCount(0);
});
