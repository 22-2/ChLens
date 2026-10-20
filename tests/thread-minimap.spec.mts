import { expect, test } from "./fixtures.mjs";
import { createLargeThreadPosts } from "./large-thread.mjs";
import {
  openThreadFromBoard,
  readMinimapState,
  scrollActivePanelToRatio,
  waitForScrollSettled,
  waitForThreadLoaded,
} from "./thread-scroll-helpers.mjs";

const RESPONSE_COUNT = 1000;
const ACTIVE_PANEL = '.content-area__tab-panel[data-active="true"]';

async function readScrollTop(page: import("@playwright/test").Page): Promise<number> {
  return page.locator(ACTIVE_PANEL).evaluate((panel) => panel.scrollTop);
}

test.describe("ミニマップのクリック", () => {
  test("表示領域マーカー内のクリックではスクロール位置を変えない", async ({
    page,
    extensionId,
    localBoard,
  }) => {
    const thread = localBoard.addLargeThread(RESPONSE_COUNT);
    await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
    await waitForThreadLoaded(page, thread.threadUrl, RESPONSE_COUNT);
    await scrollActivePanelToRatio(page, 0.5);

    const canvas = page.locator(ACTIVE_PANEL).locator(".thread-page__minimap-canvas");
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;
    const state = (await readMinimapState(page))!;
    const centerOrdinal = (state.viewportTopOrdinal + state.viewportBottomOrdinal) / 2;
    const centerY = box.y + (centerOrdinal / state.responseTotal) * box.height;
    const before = await readScrollTop(page);

    await page.mouse.move(box.x + box.width / 2, centerY);
    await page.mouse.down();
    await waitForScrollSettled(page);
    const afterDown = await readScrollTop(page);
    await page.mouse.up();
    await waitForScrollSettled(page);
    const afterUp = await readScrollTop(page);

    // マーカー内を掴んだだけの操作では、離したときに先頭合わせの再スクロールをしない。
    expect(Math.abs(afterDown - before)).toBeLessThanOrEqual(2);
    expect(Math.abs(afterUp - afterDown)).toBeLessThanOrEqual(2);
  });

  test("三角マーカーのクリックは対象レスを表示領域の中央に置く", async ({
    page,
    extensionId,
    localBoard,
  }) => {
    const thread = localBoard.addLargeThread(RESPONSE_COUNT);
    const posts = createLargeThreadPosts(RESPONSE_COUNT, localBoard.origin, thread.title);
    for (const target of [250, 500, 750]) {
      for (const offset of [100, 110, 120]) {
        const index = target + offset - 1;
        const fields = posts[index]!.split("<>");
        fields[3] = `${fields[3]} &gt;&gt;${target}`;
        posts[index] = fields.join("<>");
      }
    }
    localBoard.setDat(posts.join("\n"), thread.threadId);
    await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
    await waitForThreadLoaded(page, thread.threadUrl, RESPONSE_COUNT);
    await scrollActivePanelToRatio(page, 0.5);

    const canvas = page.locator(ACTIVE_PANEL).locator(".thread-page__minimap-canvas");
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;
    const state = (await readMinimapState(page))!;
    const marker = state.markers.find(
      (item) => item.y > box.height * 0.2 && item.y < box.height * 0.8,
    );
    expect(marker).toBeDefined();
    const before = await readScrollTop(page);

    await page.mouse.move(box.x + marker!.x, box.y + marker!.y);
    await page.mouse.down();
    await waitForScrollSettled(page);
    const afterDown = await readScrollTop(page);
    await page.mouse.up();
    await waitForScrollSettled(page);
    const afterUp = await readScrollTop(page);

    // マーカーはポインタダウンでは動かず、離したときだけ中央揃えで移動する。
    expect(Math.abs(afterDown - before)).toBeLessThanOrEqual(2);
    expect(Math.abs(afterUp - afterDown)).toBeGreaterThan(10);

    const after = (await readMinimapState(page))!;
    const centerOrdinal = (after.viewportTopOrdinal + after.viewportBottomOrdinal) / 2;
    const markerOrdinal = (marker!.y / box.height) * after.responseTotal;
    expect(Math.abs(centerOrdinal - markerOrdinal)).toBeLessThanOrEqual(1.5);
  });

  test("スクロール領域のクリックは、離してもクリック位置を中心に保つ", async ({
    page,
    extensionId,
    localBoard,
  }) => {
    const thread = localBoard.addLargeThread(RESPONSE_COUNT);
    await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
    await waitForThreadLoaded(page, thread.threadUrl, RESPONSE_COUNT);
    await scrollActivePanelToRatio(page, 0.5);

    const canvas = page.locator(ACTIVE_PANEL).locator(".thread-page__minimap-canvas");
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;
    const clickRatio = 0.2;
    const before = await readScrollTop(page);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height * clickRatio);
    await page.mouse.down();
    await waitForScrollSettled(page);
    const afterDown = await readScrollTop(page);
    await page.mouse.up();
    await waitForScrollSettled(page);
    const afterUp = await readScrollTop(page);

    expect(Math.abs(afterDown - before)).toBeGreaterThan(10);
    // 指を離したときにレス先頭へ寄せ直すと、表示領域枠がクリック位置から大きく飛ぶ。
    expect(Math.abs(afterUp - afterDown)).toBeLessThanOrEqual(2);

    const state = (await readMinimapState(page))!;
    const centerOrdinal = (state.viewportTopOrdinal + state.viewportBottomOrdinal) / 2;
    expect(Math.abs(centerOrdinal - clickRatio * state.responseTotal)).toBeLessThanOrEqual(1.5);
  });
});
