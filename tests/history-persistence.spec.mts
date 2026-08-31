import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.mjs";

const THREAD_URL = "https://example.com/test/read.cgi/live/1/";
const DAT_URL = "https://example.com/live/dat/1.dat";

const THREAD_DAT = [
  "Alice<>sage<>2026/05/11(月) 12:00:00.00 ID:abc123<>target body<>Persist Thread",
  "",
].join("\n");

async function seedExtensionState(page: Page) {
  await page.evaluate(async () => {
    const chromeApi = (
      globalThis as typeof globalThis & {
        chrome: {
          storage: {
            local: {
              clear: (callback: () => void) => void;
              set: (items: Record<string, string>, callback: () => void) => void;
            };
          };
        };
      }
    ).chrome;

    await new Promise<void>((resolve) => {
      chromeApi.storage.local.clear(() => resolve());
    });
    await new Promise<void>((resolve) => {
      chromeApi.storage.local.set(
        {
          config_bookmark_id: "1",
          config_format_2chnet: "dat",
          config_no_history: "off",
          config_ngwords: "",
        },
        () => resolve(),
      );
    });
  });
}

test.describe("閲覧履歴の永続化", () => {
  test("hidden の閲覧履歴タブへ戻ると最新の履歴が表示される", async ({
    context,
    page,
    extensionId,
  }) => {
    await context.route(`${DAT_URL}*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/plain; charset=Shift_JIS",
        body: THREAD_DAT,
      });
    });

    await page.goto(`chrome-extension://${extensionId}/view/index.html`);
    await seedExtensionState(page);
    await page.reload();

    await page.getByTitle("メニュー").click();
    await page.getByRole("button", { name: "閲覧履歴を開く" }).click();

    const activePanel = page.locator('.content-area__tab-panel[data-active="true"]');

    await expect(activePanel.locator(".history-list-page__table")).toBeVisible();

    await page.getByTitle("新しいタブ").click();

    const urlInput = page.getByPlaceholder("URLを入力");
    await urlInput.fill(THREAD_URL);
    await urlInput.press("Enter");

    await expect(
      page.locator(
        '.content-area__tab-panel[data-active="true"] .thread-page__responses [data-res-num="1"]',
      ),
    ).toBeVisible();

    await expect
      .poll(async () => {
        return await page.evaluate(async () => {
          // @ts-expect-error: app is injected by extension
          const rows = await globalThis.app.History.get(undefined, 10);
          return rows.map((row: { title: string }) => row.title);
        });
      })
      .toContain("Persist Thread");

    await page.locator('.tab[title="閲覧履歴"]').click();

    await expect(activePanel.locator(".history-list-page__table")).toBeVisible();

    await expect(
      activePanel.locator(".simple-data-table__title").filter({ hasText: "Persist Thread" }),
    ).toBeVisible();
  });
});
