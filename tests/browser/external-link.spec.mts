import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, type Page, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite-plus";

test.describe.configure({ mode: "default" });
test.use({ headless: false, channel: "msedge", viewport: { width: 1120, height: 800 } });
const root = fileURLToPath(new URL("../..", import.meta.url));
let server: ViteDevServer;
let origin: string;
let pageErrors: string[] = [];
test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    resolve: {
      alias: {
        "src/app/platform/index": path.join(
          root,
          "tests/browser/fixtures/external-link-platform.ts",
        ),
        src: path.join(root, "src"),
        packages: path.join(root, "packages"),
        "@chlen/chlib": path.join(root, "packages/chlib/src/index.ts"),
      },
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
