import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.mjs";

type TauriInternals = {
  invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
};

async function isWindowVisible(page: Page, label: string): Promise<boolean> {
  return page.evaluate(
    async (windowLabel) =>
      (
        window as typeof window & { __TAURI_INTERNALS__: TauriInternals }
      ).__TAURI_INTERNALS__.invoke("plugin:window|is_visible", { label: windowLabel }),
    label,
  ) as Promise<boolean>;
}

async function resizeOverlay(page: Page, width: number, height: number): Promise<void> {
  await page.evaluate(
    async ({ nextWidth, nextHeight }) =>
      (
        window as typeof window & { __TAURI_INTERNALS__: TauriInternals }
      ).__TAURI_INTERNALS__.invoke("plugin:window|set_size", {
        label: "comment-overlay",
        value: { Logical: { width: nextWidth, height: nextHeight } },
      }),
    { nextWidth: width, nextHeight: height },
  );
}

test("再生中に表示領域を全画面と初期位置へ再指定しても読み取り専用スレッドとOverlayを保つ", async ({
  tauri,
  localBoard,
}) => {
  const page = tauri.page;
  const replay = await tauri.window("replay");

  localBoard.setDat(
    [
      "名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>最初の日本語レス<>ローカルテストスレッド",
      "テスト住民<>sage<>2026/10/02(金) 12:00:00 ID:local002<>二番目の日本語レス<>ローカルテストスレッド",
    ].join("\n"),
  );
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
  await page.getByPlaceholder("コマンドを検索...").fill(">過去実況");
  await page.getByRole("option", { name: /過去実況再生を開く/u }).click();

  await replay.getByLabel("実況スレッドURL").fill(localBoard.threadUrl);
  await replay.getByRole("button", { name: "複数スレを読み込む" }).click();
  await expect(replay.getByText("スレ1: ローカルテストスレッド")).toBeVisible();
  await replay.getByRole("button", { name: "現在の実況スレをメインで開く" }).click();
  await replay.getByRole("button", { name: "再生", exact: true }).click();

  const overlay = await tauri.window("overlay");
  await expect.poll(() => isWindowVisible(page, "comment-overlay")).toBe(true);
  await expect(
    overlay.locator(".comment-overlay-stage__comment").filter({ hasText: "最初の日本語レス" }),
  ).toBeVisible();
  const stage = overlay.getByTestId("comment-overlay-stage");
  const originalWidth = await stage.evaluate((element) => element.getBoundingClientRect().width);
  await resizeOverlay(page, 1_600, 900);
  await expect
    .poll(() => stage.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(originalWidth);
  await expect(overlay.locator(".comment-overlay-stage__comment")).not.toHaveCount(0);
  await resizeOverlay(page, 800, 600);
  await expect
    .poll(() => stage.evaluate((element) => element.getBoundingClientRect().width))
    .toBeLessThan(1_600);
  await expect(overlay.locator(".comment-overlay-stage__comment")).not.toHaveCount(0);
  await expect(page.locator(".thread-page__replay-position")).toBeVisible();

  const statusBar = page.locator(".status-bar");
  await expect(statusBar.getByRole("button", { name: /スレッド自動更新/u })).toHaveCount(0);
  await expect(statusBar.getByRole("button", { name: /コメントOverlay制御/u })).toHaveCount(0);
  await expect(statusBar.getByRole("button", { name: "書き込みパネルを開閉" })).toHaveCount(0);
  await expect(statusBar.getByRole("button", { name: /現在のレス数/u })).toBeVisible();

  await page.getByTitle("メニュー", { exact: true }).click();
  await expect(
    page.locator(".nav-bar__menu-actions").getByRole("button", { name: "更新" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "書き込みパネル" })).toHaveCount(0);
});
