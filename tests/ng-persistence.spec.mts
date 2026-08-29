import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.mjs";

const THREAD_URL = "https://example.com/test/read.cgi/live/1/";
const DAT_URL = "https://example.com/live/dat/1.dat";

const THREAD_DAT = [
  "Alice<>sage<>2026/05/11(月) 12:00:00.00 ID:mbMNczWH4<>target body<>Persist Thread",
  "Bob<>sage<>2026/05/11(月) 12:01:00.00 ID:def456<>other body<>Persist Thread",
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
          config_ngwords: "",
        },
        () => resolve(),
      );
    });
  });
}

async function readNgStorage(page: Page) {
  return await page.evaluate(async () => {
    const chromeApi = (
      globalThis as typeof globalThis & {
        chrome: {
          storage: {
            local: {
              get: (keys: string[], callback: (items: Record<string, string>) => void) => void;
            };
          };
        };
      }
    ).chrome;

    return await new Promise<Record<string, string>>((resolve) => {
      chromeApi.storage.local.get(["config_ngwords"], (items) => {
        resolve(items as Record<string, string>);
      });
    });
  });
}

test.describe("NG設定の永続化", () => {
  test("ID/IPをNG指定したレスはページ更新後も非表示のまま", async ({
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

    const urlInput = page.getByPlaceholder("URLを入力");
    await urlInput.fill(THREAD_URL);
    await urlInput.press("Enter");

    const firstRes = page.locator('.thread-page__responses [data-res-num="1"]');
    const secondRes = page.locator('.thread-page__responses [data-res-num="2"]');

    await expect(secondRes).toBeVisible();
    await expect(firstRes).toBeVisible();

    await firstRes.click({ button: "right" });
    await page.getByRole("button", { name: "ID/IPをNG指定" }).click();

    await expect(secondRes).toBeVisible();
    await expect(firstRes).toBeHidden();

    const storedAfterAdd = await readNgStorage(page);
    expect(storedAfterAdd.config_ngwords).toContain("hide id contains:\n  mbmnczwh4");

    await page.locator('.nav-bar__btn[title="更新"]').click();

    await expect(secondRes).toBeVisible();
    await expect(firstRes).toBeHidden();

    await page.reload();

    await expect(secondRes).toBeVisible();
    await expect(firstRes).toBeHidden();
  });
});
