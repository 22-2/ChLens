import { spawn } from "node:child_process";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.mjs";

type TauriInternals = {
  invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Tauriの窓が表示されているかをネイティブの窓に問い合わせる。
 *
 * 非表示の窓もCDPにはページとして残り、WebView2の `document.visibilityState` も
 * 窓を隠しても "visible" のままなので、画面側の状態からは見分けられない。
 */
async function isWindowVisible(page: Page, label: string): Promise<boolean> {
  return page.evaluate(
    async (windowLabel) =>
      (
        window as typeof window & { __TAURI_INTERNALS__: TauriInternals }
      ).__TAURI_INTERNALS__.invoke("plugin:window|is_visible", { label: windowLabel }),
    label,
  ) as Promise<boolean>;
}

test("コマンドパレットから過去実況再生の窓を開き、閉じると非表示に戻る", async ({ tauri }) => {
  const page = tauri.page;
  const replay = await tauri.window("replay");
  await expect.poll(() => isWindowVisible(page, "archive-replay")).toBe(false);

  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
  // 入力欄は先頭の ">" でコマンド検索になるため、fillで置き換えるときも残す。
  await page.getByPlaceholder("コマンドを検索...").fill(">過去実況");
  await page.getByRole("option", { name: /過去実況再生を開く/u }).click();

  await expect.poll(() => isWindowVisible(page, "archive-replay")).toBe(true);
  await expect(replay.getByRole("heading", { name: "過去実況再生", exact: true })).toBeVisible();

  // OSの閉じる操作と同じく、破棄せず非表示にして次回も同じ窓を使う（archive-replay-window.ts）。
  await replay.getByRole("button", { name: "過去実況再生を閉じる", exact: true }).click();
  await expect.poll(() => isWindowVisible(page, "archive-replay")).toBe(false);
});

test("コメントOverlayを流し始めると、更新で届いたレスが別窓に流れる", async ({
  tauri,
  localBoard,
}) => {
  const page = tauri.page;
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(localBoard.threadUrl);
  await urlInput.press("Enter");
  const responses = page.locator(
    '.content-area__tab-panel[data-active="true"] .thread-page__responses',
  );
  await expect(responses.locator('[data-res-num="2"]')).toContainText("二番目の日本語レス");

  const overlayControl = page
    .locator(".status-bar")
    .getByRole("button", { name: /コメントOverlay制御/u });
  await overlayControl.click();
  const flowSwitch = page
    .locator(".mini-window__toggle-row")
    .filter({ hasText: "コメントを画面に流す" })
    .locator(".mini-window__switch");
  await flowSwitch.click();
  await expect(flowSwitch).toHaveAttribute("aria-pressed", "true");
  const overlay = await tauri.window("overlay");
  await expect.poll(() => isWindowVisible(page, "comment-overlay")).toBe(true);
  await page.locator(".mini-window__close").click();

  localBoard.appendPost();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(responses.locator('[data-res-num="3"]')).toContainText("更新で追加された日本語レス");
  await expect(
    overlay
      .locator(".comment-overlay-stage__comment")
      .filter({ hasText: "更新で追加された日本語レス" }),
  ).toBeVisible({ timeout: 15_000 });

  await overlayControl.click();
  await flowSwitch.click();
  await expect(flowSwitch).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => isWindowVisible(page, "comment-overlay")).toBe(false);
});

test("ウィンドウ追従中も更新ごとのコメントを続けて流す", async ({ tauri, localBoard }) => {
  // 他プロセスの窓を追従し、MainとOverlayだけのテストでは通らないnative追従経路を検証する。
  const target = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Add-Type -AssemblyName System.Windows.Forms; $form = New-Object System.Windows.Forms.Form; $form.Text = 'ChLens E2E Follow Target'; $form.Width = 800; $form.Height = 600; [System.Windows.Forms.Application]::Run($form)",
    ],
    { windowsHide: false },
  );
  try {
    const page = tauri.page;
    await page.getByTestId("title-bar-title").click();
    await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
    await page.getByPlaceholder("URLを入力").press("Enter");
    const responses = page.locator(
      '.content-area__tab-panel[data-active="true"] .thread-page__responses',
    );
    await expect(responses.locator('[data-res-num="2"]')).toBeVisible();
    // 一覧は追従モードの表示時に取得するため、別プロセスの窓が現れてから開く。
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const windows = (await (
              window as typeof window & { __TAURI_INTERNALS__: TauriInternals }
            ).__TAURI_INTERNALS__.invoke("list_comment_overlay_windows", {})) as Array<{
              title: string;
            }>;
            return windows.some((item) => item.title === "ChLens E2E Follow Target");
          }),
        { timeout: 15_000 },
      )
      .toBe(true);

    const control = page
      .locator(".status-bar")
      .getByRole("button", { name: /コメントOverlay制御/u });
    await control.click();
    await page.getByRole("button", { name: "表示位置を調整…" }).click();
    // WebView2は一時的なabout:blankのCDPページを先に出すため、名前付き窓のDOMを親窓から操作する。
    await page.evaluate(() => {
      const popup = window.open("", "chlens-comment-overlay-placement");
      if (!popup) throw new Error("配置窓を取得できませんでした");
      (window as typeof window & { followTestPopup?: Window }).followTestPopup = popup;
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const popup = (window as typeof window & { followTestPopup?: Window }).followTestPopup;
          return (
            popup?.document.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1] != null
          );
        }),
      )
      .toBe(true);
    await page.evaluate(() => {
      const popup = (window as typeof window & { followTestPopup: Window }).followTestPopup;
      popup.document.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]!.click();
    });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const popup = (window as typeof window & { followTestPopup: Window }).followTestPopup;
            const select = popup.document.querySelector<HTMLSelectElement>(
              "#overlay-attachment-target",
            );
            return Array.from(select?.options ?? []).some(
              (option) => option.text === "ChLens E2E Follow Target",
            );
          }),
        { timeout: 15_000 },
      )
      .toBe(true);
    await page.evaluate(() => {
      const popup = (window as typeof window & { followTestPopup: Window }).followTestPopup;
      const select = popup.document.querySelector<HTMLSelectElement>("#overlay-attachment-target")!;
      select.value = Array.from(select.options).find(
        (option) => option.text === "ChLens E2E Follow Target",
      )!.value;
      const change = popup.document.createEvent("Event");
      change.initEvent("change", true, false);
      select.dispatchEvent(change);
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const popup = (window as typeof window & { followTestPopup: Window }).followTestPopup;
          const select = popup.document.querySelector<HTMLSelectElement>(
            "#overlay-attachment-target",
          );
          return (
            select != null &&
            !select.disabled &&
            select.selectedOptions[0]?.text === "ChLens E2E Follow Target"
          );
        }),
      )
      .toBe(true);

    await control.click();
    const toggle = page
      .locator(".mini-window__toggle-row")
      .filter({ hasText: "コメントを画面に流す" })
      .locator(".mini-window__switch");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.locator(".mini-window__close").click();
    const overlay = await tauri.window("overlay");
    for (const responseNumber of [3, 4]) {
      localBoard.appendPost();
      await page.getByRole("button", { name: "更新", exact: true }).click();
      await expect(responses.locator(`[data-res-num="${responseNumber}"]`)).toBeVisible();
      const comment = overlay.locator(
        `.comment-overlay-stage__comment[data-response-number="${responseNumber}"]`,
      );
      await expect(comment).toBeVisible({ timeout: 15_000 });
      const startX = (await comment.boundingBox())!.x;
      // 追従中に表示だけされて動きが遅くなる場合も検出する。
      await expect
        .poll(async () => (await comment.boundingBox())?.x ?? startX, { timeout: 3_000 })
        .toBeLessThan(startX - 20);
    }
  } finally {
    target.kill();
  }
});
