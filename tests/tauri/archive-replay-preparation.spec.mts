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
