import { expect, test } from "./fixtures.mjs";
import { openThreadFromBoard, waitForThreadLoaded } from "./thread-scroll-helpers.mjs";

test("縦ツールバーをドラッグしてもミニマップの左に沿い、スクロールで位置が変わらない", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const thread = localBoard.addLargeThread(200);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 200);
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  const toolbar = panel.getByRole("toolbar", { name: "スレッド操作" });
  const minimap = panel.locator(".thread-page__minimap-canvas");
  const handle = toolbar.getByRole("button", { name: "ツールバーを移動" });
  const before = (await toolbar.boundingBox())!;
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 120, { steps: 8 });
  await page.mouse.up();
  const moved = (await toolbar.boundingBox())!;
  const map = (await minimap.boundingBox())!;
  expect(moved.y).toBeGreaterThan(before.y + 50);
  expect(moved.x + moved.width).toBeLessThanOrEqual(map.x);
  await toolbar.getByRole("button", { name: "下へジャンプ" }).click();
  await expect.poll(async () => (await toolbar.boundingBox())!.y).toBeCloseTo(moved.y, 0);
  await toolbar.getByRole("button", { name: "自動読み込みを開始" }).click();
  await expect(toolbar.getByRole("button", { name: "自動更新を一時停止" })).toBeVisible();
  await toolbar.getByRole("button", { name: "自動更新を一時停止" }).click();
  await expect(toolbar.getByRole("button", { name: "自動更新を再開" })).toBeVisible();
  await expect(page.locator(".status-bar").getByText("一時停止中")).toBeVisible();
});

test("フローティングボタンはサイドパネルの開閉とリサイズに追従する", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const thread = localBoard.addLargeThread(200);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 200);
  const down = page.getByRole("button", { name: "下へジャンプ" });
  await expect(down).toBeVisible();
  const before = (await down.boundingBox())!;
  await page.getByRole("button", { name: "サイドパネルを開く" }).click();
  const sidePanel = page.getByRole("complementary", { name: "サイドパネル" });
  const threadPanel = page.locator('.content-area__tab-panel[data-active="true"]');
  const assertOutside = async () => {
    const side = (await sidePanel.boundingBox())!;
    const button = (await down.boundingBox())!;
    expect(button.x + button.width).toBeLessThanOrEqual(side.x);
    const thread = (await threadPanel.boundingBox())!;
    expect(thread.x + thread.width).toBeLessThanOrEqual(side.x);
  };
  await expect.poll(async () => (await down.boundingBox())!.x).toBeLessThan(before.x);
  await assertOutside();
  const handle = sidePanel.getByRole("separator", { name: "サイドパネルの幅" });
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 80);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 100, handleBox.y + 80, { steps: 10 });
  await expect.poll(async () => (await sidePanel.boundingBox())!.width).toBeGreaterThan(400);
  await expect
    .poll(async () => {
      const side = (await sidePanel.boundingBox())!;
      const button = (await down.boundingBox())!;
      return button.x + button.width - side.x;
    })
    .toBeLessThanOrEqual(0);
  await page.mouse.up();
  await assertOutside();
  await down.click();
  const auto = page.getByRole("button", { name: "自動読み込みを開始" });
  await expect(auto).toBeAttached();
  const positions = await auto.evaluate((button) => {
    const b = button.getBoundingClientRect();
    const panel = document.querySelector(".side-panel")!.getBoundingClientRect();
    return { right: b.right, left: panel.left };
  });
  expect(positions.right).toBeLessThanOrEqual(positions.left);
  await page.getByRole("button", { name: "サイドパネルを閉じる" }).click();
  await page
    .locator('.content-area__tab-panel[data-active="true"]')
    .evaluate((el) => el.scrollTo(0, 0));
  await expect.poll(async () => (await down.boundingBox())?.x).toBeCloseTo(before.x, 0);
});

test("狭いペインではステータスバーの操作をアイコンにして横スクロールを防ぐ", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.setViewportSize({ width: 750, height: 700 });
  const thread = localBoard.addLargeThread(200);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 200);
  await page.getByRole("button", { name: "サイドパネルを開く" }).click();
  const bar = page.locator(".pane-column .status-bar");
  const listButton = bar.getByRole("button", { name: "スレ一覧パネルを開閉" });
  await expect(listButton).toBeVisible();
  await expect(listButton.locator("span")).toBeHidden();
  const dimensions = await bar.evaluate((element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  await listButton.click();
  await expect(page.locator(".bottom-panel")).toBeVisible();
});

test("サイドパネルの開閉で読んでいるレスを保つ", async ({ page, extensionId, localBoard }) => {
  await page.setViewportSize({ width: 750, height: 700 });
  const thread = localBoard.addLargeThread(1000);
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, 1000);
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await panel.evaluate((element) => element.scrollTo(0, element.scrollHeight * 0.7));
  await expect
    .poll(async () => panel.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(1000);
  const visibleRes = () =>
    panel.evaluate((element) => {
      const top = element.getBoundingClientRect().top + 80;
      return [...element.querySelectorAll<HTMLElement>("[data-res-num]")].find(
        (res) => res.getBoundingClientRect().bottom > top,
      )?.dataset.resNum;
    });
  const before = await visibleRes();
  expect(before).toBeDefined();
  await page.getByRole("button", { name: "サイドパネルを開く" }).click();
  await expect.poll(visibleRes).toBe(before);
  await page.getByRole("button", { name: "サイドパネルを閉じる" }).click();
  await expect.poll(visibleRes).toBe(before);
});

test("2ペインではサイドパネルの幅に合わせて両ペインが縮む", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const first = localBoard.addLargeThread(200, { id: "1000000003", title: "左のスレ" });
  const second = localBoard.addLargeThread(200, { id: "1000000004", title: "右のスレ" });
  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, first.title);
  await waitForThreadLoaded(page, first.threadUrl, 200);
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
  await page.getByPlaceholder("コマンドを検索...").fill("2ペインで表示");
  await page.getByRole("option", { name: /2ペインで表示/u }).click();
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(second.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await waitForThreadLoaded(page, second.threadUrl, 200);
  const panes = page.locator(".pane-column");
  const left = panes.nth(0).getByRole("button", { name: "下へジャンプ" });
  const right = panes.nth(1).getByRole("button", { name: "下へジャンプ" });
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  const leftBefore = (await left.boundingBox())!.x;
  const rightBefore = (await right.boundingBox())!.x;
  await page.getByRole("button", { name: "サイドパネルを開く" }).click();
  const side = page.getByRole("complementary", { name: "サイドパネル" });
  await expect.poll(async () => (await right.boundingBox())!.x).toBeLessThan(rightBefore);
  await expect.poll(async () => (await left.boundingBox())!.x).toBeLessThan(leftBefore);
  const rightPane = (await panes.nth(1).boundingBox())!;
  expect(rightPane.x + rightPane.width).toBeLessThanOrEqual((await side.boundingBox())!.x);
  expect((await right.boundingBox())!.x + (await right.boundingBox())!.width).toBeLessThanOrEqual(
    (await side.boundingBox())!.x,
  );
});
