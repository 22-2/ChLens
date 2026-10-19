import { mkdir, writeFile } from "node:fs/promises";

import type { CDPSession } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

import { expect, test } from "../fixtures.mjs";
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
});
