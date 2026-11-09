import { expect, test } from "./fixtures.mjs";

test("ペインのフォーカスを切り替えても本文とタブバーの位置が動かない", async ({
  page,
  extensionId,
  localBoard,
}) => {
  // 縦タブで左にスレ、右にスレ一覧を並べ、ナビゲーションのボタン群の受け口の
  // 付け替えで本文が一瞬ずれる問題を、描画フレームごとの位置で検出する。
  const thread = localBoard.addLargeThread(300);
  await page.addInitScript(() => {
    localStorage.setItem("config_tab_bar_orientation", "vertical");
    localStorage.setItem("config_tab_bar_collapsed", "off");
  });
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto("chrome-extension://" + extensionId + "/view/index.html");
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.boardUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  const activePanel = page.locator('.content-area__tab-panel[data-active="true"]');
  await activePanel.getByText(thread.title, { exact: true }).click();
  await expect(activePanel.locator("[data-res-num]").first()).toBeVisible();

  // スレ一覧のタブを右端へドラッグしてペインを分割する。
  const listTab = page.getByRole("tab").filter({ hasNotText: thread.title }).first();
  const tabBox = (await listTab.boundingBox())!;
  const paneBox = (await page.locator("[data-workspace-pane-id]").first().boundingBox())!;
  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tabBox.x + tabBox.width / 2 + 20, tabBox.y + tabBox.height / 2 + 20, {
    steps: 5,
  });
  await page.mouse.move(paneBox.x + paneBox.width * 0.9, paneBox.y + paneBox.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  const panes = page.locator("[data-workspace-pane-id]");
  await expect(panes).toHaveCount(2);
  await expect(panes.nth(0).locator("[data-res-num]").first()).toBeVisible();

  const snapshot = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".content-area, .tab, .tab-bar__pane-section")].map((el) => {
        const rect = el.getBoundingClientRect();
        return [el.className, rect.x, rect.y, rect.width, rect.height].join(",");
      }),
    );
  // 切り替え直後の数十フレームを記録し、途中の一瞬のずれも見逃さない。
  const framesAfter = () =>
    page.evaluate(
      () =>
        new Promise<string[][]>((resolve) => {
          const frames: string[][] = [];
          const tick = () => {
            frames.push(
              [...document.querySelectorAll(".content-area, .tab, .tab-bar__pane-section")].map(
                (el) => {
                  const rect = el.getBoundingClientRect();
                  return [el.className, rect.x, rect.y, rect.width, rect.height].join(",");
                },
              ),
            );
            if (frames.length < 30) requestAnimationFrame(tick);
            else resolve(frames);
          };
          requestAnimationFrame(tick);
        }),
    );
  const stripState = (items: string[]) =>
    // 選択中やフォーカスの見た目のクラスは変わってよいので、位置と大きさだけを比べる。
    items.map((item) => item.split(",").slice(1).join(","));

  for (const index of [1, 0, 1, 0]) {
    const before = stripState(await snapshot());
    const box = (await panes.nth(index).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
    for (const frame of await framesAfter()) {
      expect(stripState(frame)).toEqual(before);
    }
  }
});
