import { expect, test } from "./fixtures.mjs";
import { openThreadFromBoard, waitForThreadLoaded } from "./thread-scroll-helpers.mjs";

test("しきい線を越えて戻ったときに表示位置が跳ねない", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.addInitScript(() => localStorage.setItem("config_auto_load_second", "5000"));
  const thread = localBoard.addLargeThread(400);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 400);
  const status = page.getByRole("button", { name: /^スレッド自動更新: / });
  await status.click();
  await page
    .locator(".mini-window__toggle-row")
    .filter({ has: page.getByText("自動更新", { exact: true }) })
    .getByRole("button")
    .click();
  await expect(status).toHaveAccessibleName(/^スレッド自動更新: 追従中/);
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await page.keyboard.press("Escape");
  await panel.hover();
  await page.mouse.wheel(0, -500);
  await expect(status).toHaveAccessibleName(/^スレッド自動更新: 待機中/);
  await panel.evaluate((element) => {
    const state = element as HTMLElement & { samples: number[]; calls: number };
    state.samples = [];
    state.calls = 0;
    const originalScrollTo = element.scrollTo.bind(element);
    element.scrollTo = ((...args: Parameters<typeof element.scrollTo>) => {
      state.calls++;
      originalScrollTo(...args);
    }) as typeof element.scrollTo;
    const sample = () => {
      const rect = element.getBoundingClientRect();
      state.samples.push(
        [...element.querySelectorAll<HTMLElement>("[data-res-num]")].filter((res) => {
          const box = res.getBoundingClientRect();
          return box.bottom > rect.top && box.top < rect.bottom;
        }).length,
      );
      if (state.samples.length < 90) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.mouse.wheel(0, 1000);
  await expect(status).toHaveAccessibleName(/^スレッド自動更新: 追従中/);
  const offsets = await panel.evaluate(async (element) => {
    const values: number[] = [];
    for (let i = 0; i < 30; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      values.push(element.scrollHeight - element.clientHeight - element.scrollTop);
    }
    return values;
  });
  expect(Math.max(...offsets)).toBeLessThanOrEqual(2);
  const samples = await panel.evaluate(
    (element) => (element as HTMLElement & { samples: number[] }).samples,
  );
  expect(Math.min(...samples)).toBeGreaterThan(0);
  expect(
    await panel.evaluate((element) => (element as HTMLElement & { calls: number }).calls),
  ).toBe(0);
});

test("ウィンドウを広い状態から狭くしても自動更新の追従が外れない", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("config_auto_load_second", "5000");
    // ブラウザが例外ではなく window の error イベントとして配る通知も捕捉する。
    const target = window as Window & { resizeWarnings: string[] };
    target.resizeWarnings = [];
    window.addEventListener("error", (event) => {
      if (
        /^ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)/.test(
          event.message,
        )
      ) {
        target.resizeWarnings.push(event.message);
      }
    });
  });
  await page.setViewportSize({ width: 1400, height: 700 });
  const thread = localBoard.addLargeThread(400);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 400);
  const statusButton = page.getByRole("button", { name: /^スレッド自動更新: / });
  await statusButton.click();
  const autoRefreshToggle = page
    .locator(".mini-window__toggle-row")
    .filter({ has: page.getByText("自動更新", { exact: true }) })
    .getByRole("button");
  await autoRefreshToggle.click();
  await expect(autoRefreshToggle).toHaveText("ON");
  await expect(statusButton).toHaveAccessibleName(/^スレッド自動更新: 追従中/);

  await page.getByRole("button", { name: "書き込みパネルを開閉" }).click();
  await expect(statusButton).toHaveAccessibleName(/^スレッド自動更新: 追従中/);
  // 本文欄が折り返しで伸びる状態でも、幅の縮小で追従が外れないようにする。
  await page
    .getByRole("textbox", { name: "本文" })
    .fill("これは幅が狭くなると折り返して本文欄が伸びる長い入力です。".repeat(8));
  const detectorWorks = await page.evaluate(() => {
    const target = window as Window & { resizeWarnings: string[] };
    target.resizeWarnings.length = 0;
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "ResizeObserver loop completed with undelivered notifications.",
      }),
    );
    const detected = target.resizeWarnings.length === 1;
    target.resizeWarnings.length = 0;
    return detected;
  });
  expect(detectorWorks).toBe(true);
  // ウィンドウの端をドラッグする操作に近づけ、幅を細かく連続で縮める。
  for (let width = 1400; width >= 380; width -= 20) {
    await page.setViewportSize({ width, height: 700 });
    await page.waitForTimeout(16);
    // 自動更新の取得が縮小中に重なる場合も含める。
    if (width % 100 === 0) localBoard.appendLargeThreadPosts(3);
  }
  await page.waitForTimeout(600);
  await expect(statusButton).toHaveAccessibleName(/^スレッド自動更新: 追従中/);
  const atBottom = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(
      ".content-area__tab-panel[data-active='true']",
    );
    return panel ? panel.scrollHeight - panel.clientHeight - panel.scrollTop : null;
  });
  expect(atBottom).not.toBeNull();
  expect(atBottom!).toBeLessThanOrEqual(2);
  expect(
    await page.evaluate(() => (window as Window & { resizeWarnings: string[] }).resizeWarnings),
  ).toEqual([]);
});
