import { expect, test } from "./fixtures.mjs";
import { openThreadFromBoard, waitForThreadLoaded } from "./thread-scroll-helpers.mjs";

test("大量の新着をまとめて飛ばさず、取得ペースに合わせて流す", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("config_auto_load_second", "5000");
    localStorage.setItem("config_thread_display_mode", "live-chat");
  });
  const thread = localBoard.addLargeThread(2);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 2);
  await page.getByRole("button", { name: /^スレッド自動更新: / }).click();
  const toggle = page
    .locator(".mini-window__toggle-row")
    .filter({ has: page.getByText("自動更新", { exact: true }) })
    .getByRole("button");
  await toggle.click();
  await expect(toggle).toHaveText("ON");
  await page.keyboard.press("Escape");
  const requests = () =>
    localBoard.requests.filter((url) => url.includes(`/dat/${thread.threadId}.dat`)).length;
  await expect.poll(requests).toBeGreaterThanOrEqual(2);
  const readState = () =>
    page.evaluate(() => {
      const states = (
        window as typeof window & { __chlensDebug: { state: () => Record<string, unknown> } }
      ).__chlensDebug.state();
      return Object.entries(states)
        .filter(([key]) => key.startsWith("thread:"))
        .map(
          ([, state]) =>
            state as { isActive: boolean; loading: boolean; liveChatPendingCount: number },
        )
        .find((state) => state.isActive);
    });
  await expect.poll(async () => (await readState())?.loading).toBe(false);
  localBoard.appendLargeThreadPosts(100);
  await waitForThreadLoaded(page, thread.threadUrl, 102, 15000);
  const pending = (await readState())!.liveChatPendingCount;
  expect(pending).toBeGreaterThan(30);
  await expect
    .poll(async () => (await readState())?.liveChatPendingCount, { timeout: 4000 })
    .toBeLessThan(pending - 20);
  await expect
    .poll(async () => (await readState())?.liveChatPendingCount, { timeout: 8000 })
    .toBe(0);
});
