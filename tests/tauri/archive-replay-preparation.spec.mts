import { expect, test } from "./fixtures.mjs";

test("再生窓で準備画面を開き、入力不足を確認する", async ({ tauri }) => {
  const page = tauri.page;
  const replay = await tauri.window("replay");
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
  await page.getByPlaceholder("コマンドを検索...").fill("過去実況再生を開く");
  await page.getByRole("option", { name: /過去実況再生を開く/u }).click();
  await replay.getByRole("button", { name: "リプレイ準備" }).click();
  const dialog = replay.getByRole("dialog", { name: "リプレイ準備" });
  await dialog.getByRole("button", { name: "候補を集める" }).click();
  await expect(dialog.getByText("検索語と日時の範囲を確認してください。")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "この内容を使う" })).toBeDisabled();
});

test("スレ画面から題名と日時を準備画面へ引き継ぐ", async ({ tauri, localBoard }) => {
  const page = tauri.page;
  const replay = await tauri.window("replay");
  await page.getByTestId("title-bar-title").click();
  const input = page.getByPlaceholder("URLを入力");
  await input.fill(localBoard.threadUrl);
  await input.press("Enter");
  await expect(
    page.locator('.content-area__tab-panel[data-active="true"] .thread-page__responses'),
  ).toBeVisible();
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
  await page.getByPlaceholder("コマンドを検索...").fill("このスレから過去実況リプレイを準備");
  await page.getByRole("option", { name: /このスレから過去実況リプレイを準備/u }).click();
  const dialog = replay.getByRole("dialog", { name: "リプレイ準備" });
  await expect(dialog.getByLabel("検索語")).not.toBeEmpty();
  await expect(dialog.getByLabel("開始日時（日本時間）")).not.toBeEmpty();
  await expect(dialog.getByLabel("終了日時（日本時間）")).not.toBeEmpty();
});

test("複数スレを再生し、空白を指定して候補を探し直す", async ({ tauri, localBoard }) => {
  localBoard.setThreads([
    {
      id: "1000000001",
      title: "架空実況 ★1",
      posts: ["名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>最初のレス<>架空実況 ★1"],
    },
    {
      id: "1000000002",
      title: "架空実況 ★2",
      posts: ["名無し<>sage<>2026/10/02(金) 12:05:00 ID:local002<>次のレス<>架空実況 ★2"],
    },
  ]);
  const page = tauri.page;
  const replay = await tauri.window("replay");
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
  await page.getByPlaceholder("コマンドを検索...").fill("過去実況再生を開く");
  await page.getByRole("option", { name: /過去実況再生を開く/u }).click();
  await replay
    .getByLabel("実況スレッドURL")
    .fill(`${localBoard.threadUrl}\n${localBoard.origin}/test/read.cgi/local/1000000002/`);
  await replay.getByRole("button", { name: "複数スレを読み込む" }).click();
  await expect(replay.getByText("スレ1: 架空実況 ★1")).toBeVisible();
  await expect(replay.getByText("スレ2: 架空実況 ★2")).toBeVisible();
  await replay.getByRole("button", { name: "再生", exact: true }).click();
  const overlay = await tauri.window("overlay");
  await expect(
    overlay.locator(".comment-overlay-stage__comment").filter({ hasText: "最初のレス" }),
  ).toBeVisible();
  await replay.getByRole("button", { name: "候補を探し直す" }).click();
  const dialog = replay.getByRole("dialog", { name: "リプレイ準備" });
  await expect(dialog.getByLabel("開始日時（日本時間）")).toHaveValue("2026-10-02T12:00");
  await expect(dialog.getByLabel("終了日時（日本時間）")).toHaveValue("2026-10-02T12:05");
});
