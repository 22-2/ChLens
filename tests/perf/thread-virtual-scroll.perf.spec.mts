import { mkdir, writeFile } from "node:fs/promises";

import type { CDPSession } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

import { test } from "../fixtures.mjs";
import {
  openThreadFromBoard,
  runPaletteCommand,
  waitForScrollSettled,
  waitForThreadLoaded,
} from "../thread-scroll-helpers.mjs";

/**
 * スレッド表示の仮想スクロール導入前後で、描画負荷とメモリを比べる計測。
 *
 * 通常の e2e では実行せず、CHLENS_PERF=true のときだけ動かす（pnpm run perf:thread）。
 * 導入前のビルドは CHLENS_E2E_EXTENSION_PATH で差し替え、同じ手順で測る。
 * 結果は test-results/perf/<CHLENS_PERF_LABEL>.json に書き出す。
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESPONSE_COUNT = 1000;
const TAB_COUNT = 10;
const SCROLL_STEPS = 40;
// 自動更新の計測: 5秒間隔（設定で選べる最短）で届く新着を、1000レスの上限に届かない範囲で重ねる。
const AUTO_REFRESH_INITIAL_COUNT = 200;
const AUTO_REFRESH_BATCH_SIZE = 40;
const AUTO_REFRESH_BATCHES = 8;
const ACTIVE_PANEL = '.content-area__tab-panel[data-active="true"]';
const LABEL = process.env.CHLENS_PERF_LABEL ?? "current";

type Metrics = Record<string, number>;

async function readMetrics(cdp: CDPSession): Promise<Metrics> {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
}

/** 処理時間の差分をミリ秒で返す（CDPの Performance の値は秒）。 */
function durationsBetween(before: Metrics, after: Metrics) {
  const ms = (name: string) => Math.round(((after[name] ?? 0) - (before[name] ?? 0)) * 1000);
  return {
    taskMs: ms("TaskDuration"),
    scriptMs: ms("ScriptDuration"),
    layoutMs: ms("LayoutDuration"),
    recalcStyleMs: ms("RecalcStyleDuration"),
    layoutCount: (after.LayoutCount ?? 0) - (before.LayoutCount ?? 0),
  };
}

async function collectGarbage(cdp: CDPSession) {
  // 回収されずに残っている一時オブジェクトで差が埋もれないよう、測る直前にGCを走らせる。
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
}

const results: Record<string, unknown> = { label: LABEL };

// 導入前のビルドは全レスを描画するため、10タブを開くだけで既定の30秒を超えることがある。
test.describe.configure({ mode: "serial", timeout: 300_000 });

test.describe("スレッド表示の性能計測", () => {
  test.afterAll(async () => {
    const outputDir = path.resolve(__dirname, "../../test-results/perf");
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, `${LABEL}.json`), JSON.stringify(results, null, 2));
    console.log(`[perf] ${LABEL}`, JSON.stringify(results, null, 2));
  });

  test("1000レスのスレを開いて、末尾までスクロールする", async ({
    page,
    extensionId,
    localBoard,
  }) => {
    const thread = localBoard.addLargeThread(RESPONSE_COUNT);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");

    await openThreadFromBoard(page, extensionId, localBoard.boardUrl, "ローカルテストスレッド");
    await waitForThreadLoaded(page, `${localBoard.origin}/test/read.cgi/local/1000000001/`, 2);
    await collectGarbage(cdp);

    // スレ一覧へ戻ってから大きなスレを開き、取得・解析・描画にかかった処理時間を測る。
    await page.getByRole("button", { name: "戻る", exact: true }).click();
    const beforeOpen = await readMetrics(cdp);
    const openStartedAt = Date.now();
    await page.locator(ACTIVE_PANEL).getByText(thread.title, { exact: true }).click();
    await waitForThreadLoaded(page, thread.threadUrl, RESPONSE_COUNT);
    await waitForScrollSettled(page);
    const openWallMs = Date.now() - openStartedAt;
    const afterOpen = await readMetrics(cdp);
    results.openThread = {
      wallMs: openWallMs,
      ...durationsBetween(beforeOpen, afterOpen),
      nodes: afterOpen.Nodes,
      renderedResponses: await page.locator(`${ACTIVE_PANEL} .res`).count(),
    };

    // 先頭から末尾まで同じ量ずつスクロールし、スクロール中の描画・レイアウトの処理時間を測る。
    const panel = page.locator(ACTIVE_PANEL);
    const step = await panel.evaluate(
      (element, steps) => Math.ceil((element.scrollHeight - element.clientHeight) / steps),
      SCROLL_STEPS,
    );
    await panel.evaluate((element) => (element.scrollTop = 0));
    await waitForScrollSettled(page);
    const beforeScroll = await readMetrics(cdp);
    const scrollStartedAt = Date.now();
    for (let index = 0; index < SCROLL_STEPS; index++) {
      await panel.evaluate((element, delta) => element.scrollBy(0, delta), step);
      await waitForScrollSettled(page);
    }
    const scrollWallMs = Date.now() - scrollStartedAt;
    const afterScroll = await readMetrics(cdp);
    results.scrollToEnd = {
      steps: SCROLL_STEPS,
      wallMs: scrollWallMs,
      ...durationsBetween(beforeScroll, afterScroll),
    };

    await collectGarbage(cdp);
    const settled = await readMetrics(cdp);
    results.singleTab = {
      jsHeapUsedMb: Math.round((settled.JSHeapUsedSize ?? 0) / 1024 / 1024),
      nodes: settled.Nodes,
    };
  });

  test(`1000レスのスレを${TAB_COUNT}タブで開いたときのメモリとDOM`, async ({
    page,
    extensionId,
    localBoard,
  }) => {
    const threads = Array.from({ length: TAB_COUNT }, (_, index) =>
      localBoard.addLargeThread(RESPONSE_COUNT, {
        id: String(1000000010 + index),
        title: `計測スレッド${index + 1}`,
      }),
    );
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");

    await openThreadFromBoard(page, extensionId, localBoard.boardUrl, "ローカルテストスレッド");
    await waitForThreadLoaded(page, `${localBoard.origin}/test/read.cgi/local/1000000001/`, 2);
    await collectGarbage(cdp);
    const baseline = await readMetrics(cdp);

    const openStartedAt = Date.now();
    const perTabWallMs: number[] = [];
    for (const thread of threads) {
      const tabStartedAt = Date.now();
      await runPaletteCommand(page, thread.threadUrl, /^このURLを新しいタブで開く/u);
      await waitForThreadLoaded(page, thread.threadUrl, RESPONSE_COUNT, 60_000);
      await waitForScrollSettled(page);
      perTabWallMs.push(Date.now() - tabStartedAt);
    }
    const openWallMs = Date.now() - openStartedAt;
    console.log(`[perf] ${LABEL} タブごとの所要時間(ms): ${perTabWallMs.join(", ")}`);
    const afterOpen = await readMetrics(cdp);

    await collectGarbage(cdp);
    const settled = await readMetrics(cdp);
    results.tenTabs = {
      tabs: TAB_COUNT,
      openWallMs,
      lastTabWallMs: perTabWallMs.at(-1) ?? 0,
      ...durationsBetween(baseline, afterOpen),
      jsHeapUsedMb: Math.round((settled.JSHeapUsedSize ?? 0) / 1024 / 1024),
      jsHeapGrowthMb: Math.round(
        ((settled.JSHeapUsedSize ?? 0) - (baseline.JSHeapUsedSize ?? 0)) / 1024 / 1024,
      ),
      nodes: settled.Nodes,
      renderedResponses: await page.locator(".thread-page__responses .res").count(),
    };
  });

  // 変更理由: 自動更新で新着が積み重なる場面は、スレを開くだけ・スクロールするだけの計測では
  // 見えない再描画・追従スクロールの負荷が出るため、通常表示とライブ実況表示の両方を測る。
  for (const mode of ["normal", "live-chat"] as const) {
    const modeLabel = mode === "live-chat" ? "ライブ実況表示" : "通常表示";
    test(`自動更新で新着が${AUTO_REFRESH_BATCHES}回積み重なる（${modeLabel}）`, async ({
      page,
      extensionId,
      localBoard,
    }) => {
      await page.addInitScript((displayMode) => {
        localStorage.setItem("config_auto_load_second", "5000");
        if (displayMode === "live-chat") {
          localStorage.setItem("config_thread_display_mode", "live-chat");
        }
      }, mode);
      const thread = localBoard.addLargeThread(AUTO_REFRESH_INITIAL_COUNT);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");

      await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
      await waitForThreadLoaded(page, thread.threadUrl, AUTO_REFRESH_INITIAL_COUNT);

      await page.getByRole("button", { name: /^スレッド自動更新: / }).click();
      const toggle = page
        .locator(".mini-window__toggle-row")
        .filter({ has: page.getByText("自動更新", { exact: true }) })
        .getByRole("button");
      await toggle.click();
      await page.keyboard.press("Escape");
      await waitForScrollSettled(page);
      await collectGarbage(cdp);

      const before = await readMetrics(cdp);
      let expected = AUTO_REFRESH_INITIAL_COUNT;
      for (let index = 0; index < AUTO_REFRESH_BATCHES; index++) {
        localBoard.appendLargeThreadPosts(AUTO_REFRESH_BATCH_SIZE);
        expected += AUTO_REFRESH_BATCH_SIZE;
        // 取得間隔（5秒）が待ち時間の大半を占めるため、経過時間ではなく処理時間だけを比べる。
        await waitForThreadLoaded(page, thread.threadUrl, expected, 30_000);
      }
      await waitForScrollSettled(page);
      const after = await readMetrics(cdp);

      await collectGarbage(cdp);
      const settled = await readMetrics(cdp);
      results[mode === "live-chat" ? "autoRefreshLive" : "autoRefreshNormal"] = {
        batches: AUTO_REFRESH_BATCHES,
        responses: expected,
        ...durationsBetween(before, after),
        jsHeapUsedMb: Math.round((settled.JSHeapUsedSize ?? 0) / 1024 / 1024),
        nodes: settled.Nodes,
      };
    });
  }
});
