import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite-plus";

// 同じViteサーバーと依存キャッシュを共有する2件は、通常の2並列実行でも同一workerで順に動かす。
test.describe.configure({ mode: "default" });

const root = fileURLToPath(new URL("../..", import.meta.url));
// 修正前のソースも同じ入力・画面操作で比較できるよう、検証用フックだけ差し替え可能にする。
const virtualListSource = process.env.CHLENS_E2E_VIRTUAL_LIST_SOURCE;
let server: ViteDevServer;
let origin: string;

test.beforeAll(async () => {
  // 実際のNG・レス・仮想リスト部品をHTTP上で組み合わせ、個人のブラウザや設定を使わず検証する。
  server = await createServer({
    configFile: false,
    root,
    resolve: {
      // 変更理由: レスの画像表示が platform を読み込むようになり、実物は拡張機能 API を要求して
      // 画面が開かなくなった。`src/app/platform` と `.../index` の両方を差し替えへ向ける。
      alias: [
        { find: "react-dom/client", replacement: "preact/compat/client" },
        { find: "react-dom", replacement: "preact/compat" },
        { find: "react/jsx-runtime", replacement: "preact/jsx-runtime" },
        { find: "react/jsx-dev-runtime", replacement: "preact/jsx-dev-runtime" },
        { find: "react", replacement: "preact/compat" },
        ...(virtualListSource
          ? [
              {
                find: "src/features/thread/browser/use-thread-virtual-list",
                replacement: virtualListSource,
              },
            ]
          : []),
        {
          find: /^src\/app\/platform(?:\/index)?$/,
          replacement: path.join(root, "tests/browser/fixtures/ng-virtual-list-platform.ts"),
        },
        { find: /^src\//, replacement: `${path.join(root, "src")}/` },
        { find: /^packages\//, replacement: `${path.join(root, "packages")}/` },
        { find: "@chlen/chlib", replacement: path.join(root, "packages/chlib/src/index.ts") },
      ],
    },
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: { allow: [root, ...(virtualListSource ? [path.dirname(virtualListSource)] : [])] },
    },
  });
  await server.listen();
  origin = server.resolvedUrls!.local[0]!;
});

test("投稿の展開と取得後に隣のレスが重ならない", async ({ page }, testInfo) => {
  await page.goto(`${origin}tests/browser/fixtures/ng-virtual-list.html?twitter`);
  await page.getByRole("button", { name: "FxTwitter を展開する" }).click();
  await expect(page.getByText("FxTwitterから投稿を取得しています…")).toBeVisible();
  await expect(page.locator(".res__twitter-post-text")).toBeVisible();
  await expect
    .poll(async () => {
      const boxes = await Promise.all([
        page.locator('[data-res-num="3"]').boundingBox(),
        page.locator('[data-res-num="4"]').boundingBox(),
      ]);
      return boxes[0] && boxes[1] ? boxes[1].y - (boxes[0].y + boxes[0].height) : -999;
    })
    // 仮想リストの整数丸めによる1px未満の差は許容する。
    .toBeGreaterThanOrEqual(-1);
  await page.screenshot({ path: testInfo.outputPath("twitter-expanded.png") });
});

test.afterAll(async () => {
  await server?.close();
});

test.beforeEach(async ({ page }) => {
  await page.route("https://i.imgur.com/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="gray"/></svg>',
    }),
  );
  await page.goto(`${origin}tests/browser/fixtures/ng-virtual-list.html`);
  await expect(page.getByTestId("ng-results")).toHaveText("1:true,2:true,3:false");
});

test("指定の正規表現は14画像を表示し、15・16画像を完全非表示にする", async ({ page }) => {
  await expect(page.locator('[data-res-num="3"]')).toBeVisible();
  await expect(page.locator('[data-res-num="1"]')).toHaveCount(0);
  await expect(page.locator('[data-res-num="2"]')).toHaveCount(0);
  // 先頭のNGレス本文が描画されず、ゼロ高さのレスを仮想化できていることを確認する。
  await expect(page.locator('[data-res-num="1"]')).toHaveCount(0);
  for (let revision = 1; revision <= 5; revision++) {
    await page.getByRole("button", { name: "NGを再判定", exact: true }).click();
    await expect(page.getByTestId("revision")).toHaveText(String(revision));
    await expect(page.getByTestId("ng-results")).toHaveText("1:true,2:true,3:false");
    await expect(page.locator('[data-res-num="1"]')).toHaveCount(0);
  }
});

test("スクロールでNGレスを外した後も、一時解除のON/OFFを繰り返すと直ちに表示が戻る", async ({
  page,
}, testInfo) => {
  const toggle = page.getByRole("region", { name: "NG切り替え" }).getByRole("button");
  const restoredInMs: number[] = [];
  await expect(page.locator('[data-res-num="1"]')).toHaveCount(0);
  for (let cycle = 0; cycle < 5; cycle++) {
    await page.getByRole("button", { name: "中央へ", exact: true }).click();
    await expect(page.locator('[data-res-num="400"]')).toBeVisible();
    const startedAt = Date.now();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "先頭へ", exact: true }).click();
    await expect(page.locator('[data-res-num="1"]')).toBeVisible({ timeout: 1500 });
    restoredInMs.push(Date.now() - startedAt);
    if (cycle === 0) {
      await page.screenshot({ path: testInfo.outputPath("ng-revealed.png") });
    }
    await expect(page.locator('[data-res-num="1"] .res__thumb')).toHaveCount(15);
    await expect(page.locator('[data-res-num="2"]')).toHaveCount(1);
    await expect(page.getByTestId("ng-results")).toHaveText("1:true,2:true,3:false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('[data-res-num="1"]')).toHaveCount(0, { timeout: 1500 });
    await expect(page.locator('[data-res-num="2"]')).toHaveCount(0);
    await expect(page.locator('[data-res-num="1"]')).toHaveCount(0);
  }
  await page.screenshot({ path: testInfo.outputPath("ng-hidden.png") });
  await testInfo.attach("NG解除から先頭へ移動して表示されるまでの時間", {
    body: JSON.stringify({ restoredInMs }),
    contentType: "application/json",
  });
});
