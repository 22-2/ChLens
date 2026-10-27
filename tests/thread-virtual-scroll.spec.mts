import { expect, test } from "./fixtures.mjs";
import {
  expectViewportAnchor,
  jumpToResponse,
  openThreadFromBoard,
  readViewportAnchor,
  readVirtualListState,
  scrollActivePanelToRatio,
  waitForScrollSettled,
  waitForThreadLoaded,
} from "./thread-scroll-helpers.mjs";

const RESPONSE_COUNT = 1000;
const AUTO_REFRESH_RESPONSE_COUNT = 900;
/** 表示範囲と上下の余白にかかるレスの上限。全件描画に戻っていないことの確認に使う。 */
const MAX_RENDERED_RESPONSES = 80;
const WHEEL_STEPS = 30;
const WHEEL_DELTA = 120;
const ACTIVE_PANEL = '.content-area__tab-panel[data-active="true"]';

test.describe("大きなスレッドのスクロール位置", () => {
  test("別のタブへ切り替えて戻ると、同じレスが同じずれ量で表示される", async ({
    page,
    extensionId,
    localBoard,
  }) => {
    const thread = localBoard.addLargeThread(RESPONSE_COUNT);
    await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
    await waitForThreadLoaded(page, thread.threadUrl, RESPONSE_COUNT);

    await scrollActivePanelToRatio(page, 0.5);
    const before = await readViewportAnchor(page);
    expect(before).not.toBeNull();

    await page.getByTitle("新しいタブ", { exact: true }).click();
    await expect(page.locator(ACTIVE_PANEL).locator(".thread-page")).toHaveCount(0);
    await page.getByRole("tab", { name: thread.title, exact: true }).click();

    await expectViewportAnchor(page, before!);
  });

  test("再読み込みしても、保存した既読位置へ戻る", async ({ page, extensionId, localBoard }) => {
    const thread = localBoard.addLargeThread(RESPONSE_COUNT);
    await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
    await waitForThreadLoaded(page, thread.threadUrl, RESPONSE_COUNT);

    await scrollActivePanelToRatio(page, 0.4);
    const before = await readViewportAnchor(page);
    expect(before).not.toBeNull();
    // 既読位置の保存はスクロール後のタイマーとIndexedDBへの書き込みを経るため、少し待つ。
    await page.waitForTimeout(1000);

    await page.reload();
    await page.getByRole("tab", { name: thread.title, exact: true }).click();
    await waitForThreadLoaded(page, thread.threadUrl, RESPONSE_COUNT);

    // 再読み込み後は表示領域の幅やフォントの読み込みで高さがわずかに変わりうるため、少し緩める。
    await expectViewportAnchor(page, before!, 2);
  });

  test("遠いレスへのジャンプとアンカーのクリックで、目的のレスが表示される", async ({
    page,
    extensionId,
    localBoard,
  }) => {
    const thread = localBoard.addLargeThread(RESPONSE_COUNT);
    await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
    await waitForThreadLoaded(page, thread.threadUrl, RESPONSE_COUNT);

    await jumpToResponse(page, 900);
    await waitForScrollSettled(page);
    const target = page
      .locator(ACTIVE_PANEL)
      .locator('.thread-page__responses [data-res-num="900"]');
    await expect(target).toBeInViewport();
    await expect(target).toHaveClass(/res--highlighted/);
    expect((await readViewportAnchor(page))?.resNum).toBe(900);

    // レス900の「遠いアンカー >>805」から、描画範囲の外にあるレスへ移動する。
    await target.locator(".anchor", { hasText: ">>805" }).click();
    await waitForScrollSettled(page);
    await expect(
      page.locator(ACTIVE_PANEL).locator('.thread-page__responses [data-res-num="805"]'),
    ).toBeInViewport();
    expect((await readViewportAnchor(page))?.resNum).toBe(805);
  });

  test("自動更新の新着は、最下部では追従し、途中まで読んでいる位置は動かさない", async ({
    page,
    extensionId,
    localBoard,
  }) => {
    // 既定の20秒では待ち時間が長いため、設定画面で選べる最短の5秒間隔にする。
    await page.addInitScript(() => {
      localStorage.setItem("config_auto_load_second", "5000");
    });
    // 1000レスに達したスレは満了扱いで自動更新できないため、上限より少なくする。
    const thread = localBoard.addLargeThread(AUTO_REFRESH_RESPONSE_COUNT);
    await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
    await waitForThreadLoaded(page, thread.threadUrl, AUTO_REFRESH_RESPONSE_COUNT);

    await page.getByRole("button", { name: /^スレッド自動更新: / }).click();
    const autoRefreshToggle = page
      .locator(".mini-window__toggle-row")
      .filter({ has: page.getByText("自動更新", { exact: true }) })
      .getByRole("button");
    await autoRefreshToggle.click();
    await expect(autoRefreshToggle).toHaveText("ON");
    await page.keyboard.press("Escape");

    // ONにした時点で最下部へ寄るので、届いた新着の末尾まで追従していることを確かめる。
    localBoard.appendLargeThreadPosts(30);
    await waitForThreadLoaded(page, thread.threadUrl, AUTO_REFRESH_RESPONSE_COUNT + 30, 15_000);
    await waitForScrollSettled(page);
    await expect(
      page
        .locator(ACTIVE_PANEL)
        .locator(`.thread-page__responses [data-res-num="${AUTO_REFRESH_RESPONSE_COUNT + 30}"]`),
    ).toBeInViewport();
    await expect
      .poll(() =>
        page
          .locator(ACTIVE_PANEL)
          .evaluate((panel) => panel.scrollHeight - panel.scrollTop - panel.clientHeight),
      )
      .toBeLessThanOrEqual(2);

    // 途中へ戻ると追従の範囲から外れ、新着が来ても読んでいるレスの位置は変わらない。
    await scrollActivePanelToRatio(page, 0.5);
    const before = await readViewportAnchor(page);
    expect(before).not.toBeNull();
    localBoard.appendLargeThreadPosts(30);
    await waitForThreadLoaded(page, thread.threadUrl, AUTO_REFRESH_RESPONSE_COUNT + 60, 15_000);
    await waitForScrollSettled(page);
    await expectViewportAnchor(page, before!);
  });

  test("描画するレスは表示範囲の分だけで、非表示のタブではレスを描画しない", async ({
    page,
    extensionId,
    localBoard,
  }) => {
    const thread = localBoard.addLargeThread(RESPONSE_COUNT);
    await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
    await waitForThreadLoaded(page, thread.threadUrl, RESPONSE_COUNT);
    await scrollActivePanelToRatio(page, 0.5);

    const threadPanel = page.locator(".content-area__tab-panel").filter({
      has: page.locator(".thread-page"),
    });
    const renderedCount = await threadPanel.locator(".thread-page__responses .res").count();
    expect(renderedCount).toBeGreaterThan(0);
    expect(renderedCount).toBeLessThanOrEqual(MAX_RENDERED_RESPONSES);

    await page.getByTitle("新しいタブ", { exact: true }).click();
    await expect(threadPanel.locator(".thread-page__responses .res")).toHaveCount(0);
  });

  test("未実測の範囲を上へホイールで少しずつ戻っても、見ているレスは操作した量だけ動く", async ({
    page,
    extensionId,
    localBoard,
  }) => {
    const thread = localBoard.addLargeThread(RESPONSE_COUNT);
    await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
    await waitForThreadLoaded(page, thread.threadUrl, RESPONSE_COUNT);
    // 開いた直後は先頭付近しか実測していないため、末尾から上へ戻ると未実測のレスが次々に現れる。
    await scrollActivePanelToRatio(page, 1);

    const panel = page.locator(ACTIVE_PANEL);
    const box = (await panel.boundingBox())!;
    // TanStack Virtual へ切り替えてから補正回数は取れないため、未実測のレス数が減ったかで実測が進んだことを見る。
    const estimatedBefore = (await readVirtualListState(page))!.estimatedCount;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let step = 0; step < WHEEL_STEPS; step++) {
      const before = await readViewportAnchor(page);
      expect(before).not.toBeNull();
      await page.mouse.wheel(0, -WHEEL_DELTA);
      await waitForScrollSettled(page);
      const moved = await panel.evaluate(
        (element, resNum) =>
          element
            .querySelector<HTMLElement>(`.thread-page__responses [data-res-num="${resNum}"]`)
            ?.getBoundingClientRect().top ?? null,
        before!.resNum,
      );
      const panelTop = box.y;
      // 見ていたレスは、ホイールで動かした量だけ下へずれる。補正の取りこぼしがあれば大きく飛ぶ。
      expect(
        moved,
        `${step}回目のスクロールで レス${before!.resNum} の位置がずれた`,
      ).not.toBeNull();
      expect(Math.abs(moved! - panelTop - before!.offset - WHEEL_DELTA)).toBeLessThanOrEqual(1);
    }
    // 未実測のレスが実測へ置き換わり、推定値と実測値の食い違いが起きた状態で、上の位置が保たれていたことを確かめる。
    const state = await readVirtualListState(page);
    expect(state!.estimatedCount).toBeLessThan(estimatedBefore);
  });

  test("Ctrl+Fのページ内検索は表記ゆれをまとめて探し、描画していないレスの一致へも移動する", async ({
    page,
    extensionId,
    localBoard,
  }) => {
    const thread = localBoard.addLargeThread(RESPONSE_COUNT);
    await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
    await waitForThreadLoaded(page, thread.threadUrl, RESPONSE_COUNT);

    const panel = page.locator(ACTIVE_PANEL);
    await panel.locator(".thread-page").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ControlOrMeta+f");
    const input = page.getByRole("textbox", { name: "スレッド内を検索" });
    await expect(input).toBeFocused();

    // ひらがな・カタカナ・半角カナ（ｶｸﾚﾝﾎﾞ）の5件を、カタカナの検索語でまとめて探す。
    await input.fill("カクレンボ");
    const status = panel.locator(".thread-find-bar__status");
    const expectCurrentMatchIn = async (resNum: number) => {
      const res = panel.locator(`.thread-page__responses [data-res-num="${resNum}"]`);
      await expect(res.locator(".res__find-match--current")).toBeInViewport();
    };
    await expect(status).toHaveText("1 / 5");
    await expectCurrentMatchIn(120);

    for (const [index, resNum] of [300, 480, 650, 870].entries()) {
      await input.press("Enter");
      await expect(status).toHaveText(`${index + 2} / 5`);
      await expectCurrentMatchIn(resNum);
    }
    // 末尾の次は先頭へ、先頭の前は末尾へ回る。
    await input.press("Enter");
    await expect(status).toHaveText("1 / 5");
    await expectCurrentMatchIn(120);
    await input.press("Shift+Enter");
    await expect(status).toHaveText("5 / 5");
    await expectCurrentMatchIn(870);

    // 全角英字とカタカナの本文に、半角英字とひらがなの検索語で一致する。
    await input.fill("abcてすと");
    await expect(status).toHaveText("1 / 1");
    await expectCurrentMatchIn(777);

    await input.press("Escape");
    await expect(input).toBeHidden();
    await expect(panel.locator(".res__find-match")).toHaveCount(0);
  });
});
