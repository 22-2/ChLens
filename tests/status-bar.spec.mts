import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("通信メッセージの表示と切り替えでステータスバーの高さが変わらない", async ({ page }) => {
  // jsdomでは行高と罫線によるレイアウト変化を測れないため、実ブラウザで共通CSSを検証する。
  const styles = await Promise.all(
    [
      "foundation/reset.css",
      "foundation/tokens.css",
      "foundation/themes.css",
      "foundation/base.css",
      "components/StatusBar.css",
    ].map((file) =>
      readFile(new URL(`../src/view/browser/styles/${file}`, import.meta.url), "utf8"),
    ),
  );
  await page.setContent(`
    <footer class="status-bar">
      <div class="status-bar__group"></div>
      <div class="status-bar__group status-bar__group--right">
        <div class="status-bar__item status-bar__item--interactive">
          <button class="status-bar__btn">スレ一覧</button>
        </div>
      </div>
    </footer>
  `);
  await page.addStyleTag({ content: styles.join("\n") });

  const bar = page.locator(".status-bar");
  const height = await bar.evaluate((element) => element.getBoundingClientRect().height);
  await page.locator(".status-bar__group--right").evaluate((element) => {
    element.insertAdjacentHTML(
      "afterbegin",
      `<div class="status-bar__item operation-status">
        <span class="operation-status__content" role="status">
          <svg class="icon--spinning" width="24" height="24" aria-hidden="true"></svg>
          <span class="operation-status__message">スレ読み込み中...</span>
        </span>
      </div>`,
    );
  });
  expect(await bar.evaluate((element) => element.getBoundingClientRect().height)).toBe(height);

  await page.locator(".operation-status").evaluate((element) => {
    element.classList.add("operation-status--error");
    element.querySelector("svg")?.remove();
    element.querySelector(".operation-status__message")!.textContent =
      "スレッドの取得に失敗しました";
  });
  expect(await bar.evaluate((element) => element.getBoundingClientRect().height)).toBe(height);

  await page.locator(".operation-status").evaluate((element) => element.remove());
  expect(await bar.evaluate((element) => element.getBoundingClientRect().height)).toBe(height);
});
