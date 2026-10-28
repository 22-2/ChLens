import { expect, test } from "./fixtures.mjs";
import { openThreadFromBoard, waitForThreadLoaded } from "./thread-scroll-helpers.mjs";

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
  const assertOutside = async () => {
    const side = (await sidePanel.boundingBox())!;
    const button = (await down.boundingBox())!;
    expect(button.x + button.width).toBeLessThanOrEqual(side.x);
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

test("2ペインではサイドパネルと重なるペインのボタンだけ移動する", async ({
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
  await page.getByPlaceholder("コマンドを検索...").fill(">2ペインで表示");
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
  expect((await left.boundingBox())!.x).toBeCloseTo(leftBefore, 0);
  expect((await right.boundingBox())!.x + (await right.boundingBox())!.width).toBeLessThanOrEqual(
    (await side.boundingBox())!.x,
  );
});
