import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.mjs";
import {
  expectViewportAnchor,
  openThreadFromBoard,
  readViewportAnchor,
  scrollActivePanelToRatio,
  waitForThreadLoaded,
} from "./thread-scroll-helpers.mjs";

async function readLiveChatState(page: Page) {
  return page.evaluate(() => {
    const states = (
      window as typeof window & { __chlensDebug: { state: () => Record<string, unknown> } }
    ).__chlensDebug.state();
    return Object.entries(states)
      .filter(([key]) => key.startsWith("thread:"))
      .map(
        ([, state]) =>
          state as {
            isActive: boolean;
            loading: boolean;
            canAutoScroll: boolean;
            liveChatPendingCount: number;
          },
      )
      .find((state) => state.isActive);
  });
}

async function startLiveChat(page: Page) {
  await page.getByRole("button", { name: /^スレッド自動更新: / }).click();
  const toggle = page
    .locator(".mini-window__toggle-row")
    .filter({ has: page.getByText("自動更新", { exact: true }) })
    .getByRole("button");
  await toggle.click();
  await expect(toggle).toHaveText("ON");
  await page.keyboard.press("Escape");
}

test("実況表示は手動取得設定でも画像を自動で読み込む", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const imageUrl = `${localBoard.origin}/img/1.png`;
  localBoard.setDat(
    `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>画像 ${imageUrl}<>ローカルテストスレッド`,
  );
  await page.addInitScript(() => {
    localStorage.setItem("config_thread_display_mode", "live-chat");
    localStorage.setItem("config_manual_image_loading", "on");
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");

  const response = page.locator('[data-res-num="1"]');
  const image = response.locator(".res__thumb--image img");
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  // 表示モードだけの変更なので、利用者の手動取得設定は書き換えない。
  expect(await page.evaluate(() => localStorage.getItem("config_manual_image_loading"))).toBe("on");
});

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

test("別タブから戻った直後は新着へ追いつき、その次から流す", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("config_auto_load_second", "5000");
    localStorage.setItem("config_thread_display_mode", "live-chat");
  });
  const thread = localBoard.addLargeThread(100);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 100);
  await startLiveChat(page);
  await expect.poll(async () => (await readLiveChatState(page))?.canAutoScroll).toBe(true);
  await page.getByTitle("新しいタブ", { exact: true }).click();
  localBoard.appendLargeThreadPosts(50);
  await page.getByRole("tab", { name: thread.title }).click();
  await waitForThreadLoaded(page, thread.threadUrl, 150, 15000);
  expect((await readLiveChatState(page))?.liveChatPendingCount).toBe(0);
  await expect.poll(async () => (await readLiveChatState(page))?.canAutoScroll).toBe(true);
  localBoard.appendLargeThreadPosts(50);
  await waitForThreadLoaded(page, thread.threadUrl, 200, 15000);
  expect((await readLiveChatState(page))!.liveChatPendingCount).toBeGreaterThan(0);
});

test("過去レスの閲覧中とタブ復帰時は位置を保って新着を即表示し、末尾で再び流す", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("config_auto_load_second", "5000");
    localStorage.setItem("config_thread_display_mode", "live-chat");
  });
  const thread = localBoard.addLargeThread(300);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 300);
  await startLiveChat(page);
  await expect.poll(async () => (await readLiveChatState(page))?.canAutoScroll).toBe(true);
  await scrollActivePanelToRatio(page, 0.5);
  await expect.poll(async () => (await readLiveChatState(page))?.canAutoScroll).toBe(false);
  const anchor = await readViewportAnchor(page);
  expect(anchor).not.toBeNull();
  localBoard.appendLargeThreadPosts(50);
  await waitForThreadLoaded(page, thread.threadUrl, 350, 15000);
  expect((await readLiveChatState(page))?.liveChatPendingCount).toBe(0);
  await expectViewportAnchor(page, anchor!);
  await page.getByTitle("新しいタブ", { exact: true }).click();
  localBoard.appendLargeThreadPosts(50);
  await page.getByRole("tab", { name: thread.title }).click();
  await waitForThreadLoaded(page, thread.threadUrl, 400, 15000);
  expect((await readLiveChatState(page))?.liveChatPendingCount).toBe(0);
  await expectViewportAnchor(page, anchor!);
  await scrollActivePanelToRatio(page, 1);
  await expect.poll(async () => (await readLiveChatState(page))?.canAutoScroll).toBe(true);
  localBoard.appendLargeThreadPosts(50);
  await waitForThreadLoaded(page, thread.threadUrl, 450, 15000);
  expect((await readLiveChatState(page))!.liveChatPendingCount).toBeGreaterThan(0);
});
