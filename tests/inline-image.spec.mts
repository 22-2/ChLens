import { expect, test } from "./fixtures.mjs";
import { jumpToResponse } from "./thread-scroll-helpers.mjs";

test("画像をレス内で展開し、仮想スクロール後も状態を保つ", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const image1 = `${localBoard.origin}/img/1.png`;
  localBoard.setImageBody(
    1,
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="900"><rect width="1800" height="900" fill="blue"/></svg>',
    ),
    "image/svg+xml",
  );
  const posts = Array.from({ length: 150 }, (_, i) =>
    i === 0
      ? `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>画像 ${image1}<>ローカルテストスレッド`
      : `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local002<>本文 ${i + 1}<>`,
  );
  localBoard.setDat(posts.join("\n"));
  await page.addInitScript(() => {
    localStorage.setItem("config_manual_image_loading", "off");
    localStorage.setItem("config_confirm_external_link", "off");
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(localBoard.threadUrl);
  await urlInput.press("Enter");
  const first = page.locator('[data-res-num="1"]');
  await expect(first.locator(".res__thumb--image")).toHaveCount(1);
  const saveOne = first.getByRole("button", { name: `画像を保存: ${image1}` });
  await expect(saveOne).toBeVisible();
  await expect(saveOne.locator("svg")).toHaveCount(1);
  await expect(saveOne).toHaveText("");
  await first.locator(".res__thumb--image").first().click();
  await expect(first.getByRole("button", { name: "画像を折りたたむ" })).toBeVisible();
  const image = first.locator(".res__inline-image img");
  const nextResponse = page.locator('[data-res-num="2"]');
  const expectNoOverlap = async () => {
    await expect
      .poll(async () => {
        const firstBox = await first.boundingBox();
        const nextBox = await nextResponse.boundingBox();
        return firstBox && nextBox ? nextBox.y - (firstBox.y + firstBox.height) : -999;
      })
      .toBeGreaterThanOrEqual(-1);
  };
  await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1800);
  await expectNoOverlap();
  const expectImageFrameFits = async (index: number) => {
    const frame = first.locator(".res__inline-image").nth(index);
    const size = await frame.evaluate((element) => {
      const frameRect = element.getBoundingClientRect();
      const imageRect = element.querySelector("img")!.getBoundingClientRect();
      return {
        width: frameRect.width - imageRect.width,
        height: frameRect.height - imageRect.height,
      };
    });
    expect(Math.abs(size.width)).toBeLessThan(1);
    expect(Math.abs(size.height)).toBeLessThan(1);
  };
  await expectImageFrameFits(0);
  expect(await image.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(480);
  expect(await image.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(
    (await page.evaluate(() => window.innerHeight)) * 0.6,
  );
  expect(await image.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(
    await first.evaluate((el) => el.getBoundingClientRect().width),
  );
  const handle = first.locator(".res__inline-image-resize");
  const actions = first.locator(".res__inline-image-actions");
  await page.mouse.move(0, 0);
  await expect(handle).toHaveCSS("opacity", "0");
  await expect(actions).toHaveCSS("opacity", "0");
  await first.locator(".res__inline-image").hover();
  await expect(handle).toHaveCSS("opacity", "1");
  await expect(actions).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await handle.focus();
  await expect(handle).toHaveCSS("opacity", "1");
  await expect(actions).toHaveCSS("opacity", "1");
  await expect(handle).toBeVisible();
  const initialWidth = (await image.boundingBox())!.width;
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 100,
    handleBox.y + handleBox.height / 2 + 50,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await image.boundingBox())!.width)
    .toBeGreaterThan(initialWidth + 80);
  await expectNoOverlap();
  await expectImageFrameFits(0);
  const adjustedWidth = (await image.boundingBox())!.width;
  await expect(page.locator(".media-viewer")).toHaveCount(0);
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await image.boundingBox())!.width).toBeLessThan(adjustedWidth);
  const savedWidth = (await image.boundingBox())!.width;
  await expect(page.locator(".media-viewer")).toHaveCount(0);
  await jumpToResponse(page, 150);
  await expect(first).toHaveCount(0);
  await jumpToResponse(page, 1);
  await expect(first.getByRole("button", { name: "画像を折りたたむ" })).toBeVisible();
  await expectNoOverlap();
  await expect
    .poll(async () => (await first.locator(".res__inline-image img").boundingBox())!.width)
    .toBeCloseTo(savedWidth, 0);
  await first.getByRole("button", { name: "画像を折りたたむ" }).click();
  await first.locator(".res__thumb--image").first().click();
  await expect
    .poll(async () => (await first.locator(".res__inline-image img").boundingBox())!.width)
    .toBeCloseTo(savedWidth, 0);
  await first.getByRole("button", { name: "画像を縮小" }).click();
  await expect(first.locator(".res__thumb--image")).toHaveCount(1);
});

test("複数画像のレスはまとめて保存でき、クリックでビューアを開く", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const image1 = `${localBoard.origin}/img/1.png`;
  const image2 = `${localBoard.origin}/img/2.png`;
  localBoard.setDat(
    `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>画像 ${image1} ${image2}<>ローカルテストスレッド`,
  );
  await page.addInitScript(() => localStorage.setItem("config_manual_image_loading", "off"));
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  const first = page.locator('[data-res-num="1"]');
  const thumbs = first.locator(".res__thumb--image");
  await expect(thumbs).toHaveCount(2);
  const saveAll = first.getByRole("button", { name: "このレスの画像をすべて保存" });
  await expect(saveAll).toBeVisible();
  await expect(saveAll.locator("svg")).toHaveCount(1);
  const thumbsBox = (await first.locator(".res__thumbs").boundingBox())!;
  expect((await saveAll.boundingBox())!.y).toBeGreaterThanOrEqual(thumbsBox.y + thumbsBox.height);
  // 複数画像のレスは比較しやすいよう、インライン展開ではなくビューアで開く。
  await thumbs.first().click();
  await expect(page.locator(".media-viewer__label")).toHaveText(image1);
  await expect(first.locator(".res__inline-image")).toHaveCount(0);
});

test("スレ途中の画像を続けて展開しても後続のレスと重ならない", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const image = `${localBoard.origin}/img/1.png`;
  localBoard.setImageBody(
    1,
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1200"><rect width="600" height="1200" fill="blue"/></svg>',
    ),
    "image/svg+xml",
  );
  localBoard.setDat(
    Array.from(
      { length: 150 },
      (_, i) =>
        `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>${i === 79 || i === 80 ? `画像 ${image}` : `本文 ${i + 1}`}<>${i === 0 ? "ローカルテストスレッド" : ""}`,
    ).join("\n"),
  );
  await page.addInitScript(() => localStorage.setItem("config_manual_image_loading", "off"));
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await jumpToResponse(page, 80);
  const first = page.locator('[data-res-num="80"]');
  const second = page.locator('[data-res-num="81"]');
  await first.locator(".res__thumb--image").click();
  await second.locator(".res__thumb--image").click();
  const third = page.locator('[data-res-num="82"]');
  const checkRows = async () =>
    expect
      .poll(async () => {
        const boxes = await Promise.all([
          first.boundingBox(),
          second.boundingBox(),
          third.boundingBox(),
        ]);
        return boxes.every(Boolean)
          ? Math.min(
              boxes[1]!.y - boxes[0]!.y - boxes[0]!.height,
              boxes[2]!.y - boxes[1]!.y - boxes[1]!.height,
            )
          : -999;
      })
      .toBeGreaterThanOrEqual(-1);
  await checkRows();
  await jumpToResponse(page, 150);
  await expect(first).toHaveCount(0);
  await page.evaluate(() => {
    const probe = window as typeof window & { overlapSamples: number[]; stopOverlapProbe: boolean };
    probe.overlapSamples = [];
    probe.stopOverlapProbe = false;
    const sample = () => {
      if (probe.stopOverlapProbe) return;
      const first = document.querySelector('[data-res-num="80"]');
      const second = document.querySelector('[data-res-num="81"]');
      if (first && second && first.querySelector(".res__inline-image img")) {
        const a = first.getBoundingClientRect();
        const b = second.getBoundingClientRect();
        probe.overlapSamples.push(b.top - a.bottom);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await jumpToResponse(page, 80);
  await expect(first.locator(".res__inline-image img")).toBeVisible();
  await expect(second.locator(".res__inline-image img")).toBeVisible();
  await checkRows();
  const samples = await page.evaluate(() => {
    const probe = window as typeof window & { overlapSamples: number[]; stopOverlapProbe: boolean };
    probe.stopOverlapProbe = true;
    return probe.overlapSamples;
  });
  expect(samples.length).toBeGreaterThan(0);
  expect(Math.min(...samples)).toBeGreaterThanOrEqual(-1);
});

test("画像のメニューからビューアを別窓で開く", async ({
  page,
  extensionId,
  localBoard,
  context,
}) => {
  const image = `${localBoard.origin}/img/1.png`;
  localBoard.setDat(
    `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>画像 ${image}<>ローカルテストスレッド`,
  );
  await page.addInitScript(() => localStorage.setItem("config_manual_image_loading", "off"));
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  const thumb = page.locator('.content-area__tab-panel[data-active="true"] .res__thumb--image');
  await thumb.click({ button: "right" });
  const open = page.getByRole("menuitem", { name: "ビューアを別窓で開く" });
  await expect(open).toBeVisible();
  const popupPromise = context.waitForEvent("page");
  await open.click();
  const popup = await popupPromise;
  await expect(popup.locator(".media-viewer")).toBeVisible();
  await expect(popup).toHaveTitle("ビューア - read.crx 2");
});

test("サムネイルと展開画像のメニューからビューアを開く", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const image = `${localBoard.origin}/img/1.png`;
  localBoard.setImageBody(
    1,
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="blue"/></svg>',
    ),
    "image/svg+xml",
  );
  localBoard.setDat(
    `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>画像 ${image}<>ローカルテストスレッド`,
  );
  await page.addInitScript(() => localStorage.setItem("config_manual_image_loading", "off"));
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  const thumb = page.locator('.content-area__tab-panel[data-active="true"] .res__thumb--image');
  await thumb.click({ button: "right" });
  await page.getByRole("menuitem", { name: "ビューアで開く", exact: true }).click();
  await expect(page.locator(".media-viewer__label")).toHaveText(image);
  await page.locator(".media-viewer__close").click();
  await thumb.click();
  const expanded = page.getByRole("button", { name: "画像を折りたたむ" });
  await expect(expanded).toBeVisible();
  await expanded.click({ button: "right" });
  await page.getByRole("menuitem", { name: "ビューアで開く", exact: true }).click();
  await expect(page.locator(".media-viewer__label")).toHaveText(image);
});
