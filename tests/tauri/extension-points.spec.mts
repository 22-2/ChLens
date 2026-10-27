import { verifyTwoPaneFilters } from "../extension-points-scenarios.mjs";
import { expect, test } from "./fixtures.mjs";

test("2ペインでフィルター操作がそれぞれのスレに届く", async ({ page, localBoard }) => {
  await verifyTwoPaneFilters(page, localBoard);
});

test("別窓への移動と復帰後もフィルター操作が対象のスレに届く", async ({ page, localBoard }) => {
  const second = localBoard.addLargeThread(3, { id: "1000000002", title: "別窓のテストスレ" });
  const registrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("ページ操作の二重登録")) {
      registrationErrors.push(message.text());
    }
  });
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(page.locator('[data-res-num="2"]')).toBeVisible();
  await page.getByRole("button", { name: "新しいタブ", exact: true }).click();
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(second.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(page.getByTestId("title-bar-title")).toHaveText(second.title);

  // WebView2は子窓作成時のCDPページをすぐ閉じるため、実際のWindowProxyを記録する。
  // 別窓内は同じDOMへイベントを送って検証し、メイン窓はPlaywrightの通常操作を使う。
  await page.evaluate(() => {
    const originalOpen = window.open;
    window.open = (...args) => {
      const child = originalOpen.apply(window, args);
      (window as typeof window & { __e2eTabWindow?: Window | null }).__e2eTabWindow = child;
      window.open = originalOpen;
      return child;
    };
  });
  await page.getByTestId("title-bar-title").click({ button: "right" });
  await page.getByRole("button", { name: "別窓で開く", exact: true }).click();
  const nativePopupLabels = () =>
    page.evaluate(async () => {
      const api = (
        window as typeof window & {
          __TAURI_INTERNALS__: { invoke: (command: string) => Promise<string[]> };
        }
      ).__TAURI_INTERNALS__;
      return (await api.invoke("plugin:window|get_all_windows")).filter((label) =>
        label.startsWith("chlens-popup-"),
      );
    });
  await expect.poll(nativePopupLabels).toHaveLength(1);
  const [popupLabel] = await nativePopupLabels();
  const popupState = () =>
    page.evaluate(() => {
      const child = (window as typeof window & { __e2eTabWindow?: Window | null }).__e2eTabWindow;
      if (!child || child.closed) return { open: false, response: false, filter: false };
      return {
        open: true,
        response: !!child.document.querySelector('[data-res-num="3"]'),
        filter: !!child.document.querySelector('input[placeholder="フィルタする文字を入力"]'),
      };
    });
  await expect.poll(popupState).toEqual({ open: true, response: true, filter: false });
  await expect(page.getByTestId("title-bar-title")).toHaveText("ローカルテストスレッド");

  await page.evaluate(() => {
    const child = (window as typeof window & { __e2eTabWindow: Window }).__e2eTabWindow;
    const button = child.document.querySelector<HTMLButtonElement>(
      'button[aria-label^="現在のレス数:"]',
    );
    if (!button) throw new Error("別窓のレス数ボタンが見つかりません");
    button.click();
  });
  await expect.poll(popupState).toMatchObject({ open: true, filter: true });
  const mainPanel = page.locator('.content-area__tab-panel[data-active="true"]');
  const mainFilter = mainPanel.getByPlaceholder("フィルタする文字を入力");
  const mainCount = page.getByRole("button", { name: /^現在のレス数:/u });
  await expect(mainFilter).toHaveCount(0);
  await mainCount.click();
  await expect(mainFilter).toBeVisible();
  await mainCount.click();
  await expect(mainFilter).toHaveCount(0);
  await expect.poll(popupState).toMatchObject({ open: true, filter: true });

  await page.evaluate(() => {
    const child = (window as typeof window & { __e2eTabWindow: Window }).__e2eTabWindow;
    const title = child.document.querySelector('[data-testid="title-bar-title"]');
    if (!title) throw new Error("別窓のタイトルが見つかりません");
    title.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, button: 2, clientX: 100, clientY: 30 }),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const child = (window as typeof window & { __e2eTabWindow: Window }).__e2eTabWindow;
        return Array.from(child.document.querySelectorAll(".context-menu__item")).some(
          (item) => item.textContent?.trim() === "メイン画面へ戻す",
        );
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    const child = (window as typeof window & { __e2eTabWindow: Window }).__e2eTabWindow;
    const button = Array.from(
      child.document.querySelectorAll<HTMLButtonElement>(".context-menu__item"),
    ).find((item) => item.textContent?.trim() === "メイン画面へ戻す");
    if (!button) throw new Error("別窓の復帰ボタンが見つかりません");
    button.click();
  });
  await expect(page.getByTestId("title-bar-title")).toHaveText(second.title);
  await expect.poll(popupState).toMatchObject({ open: false });
  // WindowProxyが閉じてもOS窓が空のまま残ることがあるため、ネイティブ側も確認する。
  await expect.poll(nativePopupLabels).not.toContain(popupLabel);
  await expect(mainPanel.locator('[data-res-num="3"]')).toBeVisible();
  await mainCount.click();
  await expect(mainFilter).toBeVisible();
  expect(registrationErrors).toEqual([]);
});
