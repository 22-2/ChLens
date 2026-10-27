import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, type Page, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite-plus";

test.describe.configure({ mode: "default" });
// 変更理由: CI の Ubuntu には画面も Edge もなく、表示ありの Edge は起動できずに全件失敗していた。
// CI では導入済みの Chromium を画面なしで使い、手元では offstage-windows の隠しデスクトップに Edge を出す。
test.use({
  ...(process.env.CI ? {} : { headless: false, channel: "msedge" }),
  viewport: { width: 1120, height: 800 },
});
const root = fileURLToPath(new URL("../..", import.meta.url));
let server: ViteDevServer;
let origin: string;
let pageErrors: string[] = [];
test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    resolve: {
      // 変更理由: platform は `src/app/platform` と `.../index` の両方で import されるため、
      // どちらも記録用の差し替えへ向ける。片方だけだと実際の拡張機能 API を読み込んで画面が開かない。
      alias: [
        {
          find: /^src\/app\/platform(?:\/index)?$/,
          replacement: path.join(root, "tests/browser/fixtures/external-link-platform.ts"),
        },
        { find: /^src\//, replacement: `${path.join(root, "src")}/` },
        { find: /^packages\//, replacement: `${path.join(root, "packages")}/` },
        { find: "@chlen/chlib", replacement: path.join(root, "packages/chlib/src/index.ts") },
      ],
    },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  });
  await server.listen();
  origin = server.resolvedUrls!.local[0]!;
});
test.afterAll(async () => {
  await server?.close();
});
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://images.example.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="gray"/></svg>',
    }),
  );
  await page.goto(`${origin}tests/browser/fixtures/external-link.html`);
  await expect(page.getByTestId("opened")).toHaveText("[]");
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});
const article = (page: Page) =>
  page
    .getByRole("region", { name: "本文", exact: true })
    .getByRole("button", { name: "記事リンク" });

for (const input of ["クリック", "ミドルクリック", "Enter", "Space", "Ctrlクリック"]) {
  test(`${input}は承認まで外部起動せず、キャンセルでも開かない`, async ({ page }) => {
    const target = article(page);
    if (input === "Enter" || input === "Space") {
      await target.focus();
      await page.keyboard.press(input);
    } else
      await target.click({
        button: input === "ミドルクリック" ? "middle" : "left",
        modifiers: input === "Ctrlクリック" ? ["Control"] : [],
      });
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByText("追跡・紹介用パラメータの除去候補:", { exact: false }),
    ).toBeVisible();
    await expect(page.getByTestId("opened")).toHaveText("[]");
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("opened")).toHaveText("[]");
  });
}

test("除去後URLを明示選択してから1回だけ開く", async ({ page }, info) => {
  await article(page).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await expect(dialog.getByRole("textbox")).toHaveValue("https://example.com/article?id=42");
  await page.screenshot({ path: info.outputPath("confirmation-light.png") });
  await dialog.getByRole("button", { name: "開く", exact: true }).click();
  await expect
    .poll(async () => JSON.parse(await page.getByTestId("opened").innerText()))
    .toEqual([{ url: "https://example.com/article?id=42", active: true, newWindow: false }]);
});

for (const theme of ["light", "dark"]) {
  test(`仮想レス一覧でも右クリックメニューを最前面に表示する (${theme})`, async ({
    page,
  }, info) => {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
      const section = document.querySelector<HTMLElement>('section[aria-label="本文"]')!;
      // 仮想一覧の各レスと同じく、transformによる重なりコンテキストを作る。
      section.style.transform = "translateY(0px)";
      const nextResponse = document.createElement("div");
      nextResponse.textContent = "次のレスの本文";
      nextResponse.style.cssText = "position:relative; height:240px; margin-top:8px";
      section.after(nextResponse);
    }, theme);
    await article(page).click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(32, 33, 36)" : "rgb(255, 255, 255)",
    );
    const lastItem = page.getByRole("menuitem", {
      name: "追跡情報を除いてURLをコピー",
      exact: true,
    });
    await expect
      .poll(() =>
        lastItem.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: info.outputPath(`context-menu-${theme}.png`) });
    await page.getByRole("menuitem", { name: "開く", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
}

for (const action of ["開く", "新しいタブで開く", "新しいウィンドウで開く"]) {
  test(`右クリックの「${action}」も確認してから開く`, async ({ page }) => {
    await article(page).click({ button: "right" });
    await page.getByRole("menuitem", { name: action, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("opened")).toHaveText("[]");
    await page.getByRole("dialog").getByRole("button", { name: "開く", exact: true }).click();
    await expect
      .poll(async () => JSON.parse(await page.getByTestId("opened").innerText()))
      .toEqual([
        {
          url: "https://example.com/article?id=42&utm_source=test",
          active: action !== "新しいタブで開く",
          newWindow: action === "新しいウィンドウで開く",
        },
      ]);
  });
}

test("画像はビューアで表示し、ビューアからの外部起動と画像右クリックは確認する", async ({
  page,
}) => {
  const thumbnail = page
    .getByRole("region", { name: "画像", exact: true })
    .locator("button.res__thumb");
  await thumbnail.click();
  await expect(page.locator(".media-viewer")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("opened")).toHaveText("[]");
  await page.getByRole("button", { name: "ブラウザで開く", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.locator(".media-viewer__image").click({ button: "right" });
  await page.getByRole("menuitem", { name: "新しいタブで開く", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("opened")).toHaveText("[]");
});

test("ポップアップ方式の画像ミドルクリックでも確認は一つだけ", async ({ page }) => {
  await page
    .getByRole("region", { name: "画像", exact: true })
    .locator("button.res__thumb")
    .click({ button: "middle" });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByRole("button", { name: "開く", exact: true }).click();
  await expect
    .poll(async () => JSON.parse(await page.getByTestId("opened").innerText()).length)
    .toBe(1);
  await expect(page.getByTestId("opened")).toContainText('"active":false');
});

test("OFFへ切り替えると本文・画像が実URLを持つリンクへ戻る", async ({ page }) => {
  await page.getByRole("checkbox", { name: "確認機能", exact: true }).uncheck();
  const link = page.getByRole("link", { name: "記事リンク", exact: true });
  await expect(link).toHaveAttribute("href", "https://example.com/article?id=42&utm_source=test");
  await expect(
    page.getByRole("region", { name: "画像", exact: true }).locator("a.res__thumb"),
  ).toHaveAttribute("href", /photo\.png/);
  const eventCancelled = await link.evaluate(
    (element) =>
      !element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
  );
  expect(eventCancelled).toBe(false);
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("非Web URLは承認できず、暗いテーマでも確認内容を表示する", async ({ page }, info) => {
  await page.getByRole("button", { name: "ダーク表示", exact: true }).click();
  await page.getByRole("button", { name: "非Web URLを検証", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "開く", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: info.outputPath("confirmation-dark.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("opened")).toHaveText("[]");
});

test("別Documentでは操作元に確認を出し、Escape後に元のボタンへフォーカスを戻す", async ({
  page,
}) => {
  const frame = page.frameLocator('iframe[title="別Documentのリンク"]');
  const link = frame.getByRole("button", { name: "別窓リンク", exact: true });
  await link.focus();
  await link.press("Enter");
  await expect(frame.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await frame.getByRole("button", { name: "キャンセル", exact: true }).press("Escape");
  await expect(frame.getByRole("dialog")).toHaveCount(0);
  await expect(link).toBeFocused();
  await expect(page.getByTestId("opened")).toHaveText("[]");
});

test("キーボードの右クリックメニューと通常の埋め込みリンクも確認に通す", async ({ page }) => {
  await article(page).focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "開く", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.getByRole("button", { name: "埋め込み投稿のリンク", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("opened")).toHaveText("[]");
});
