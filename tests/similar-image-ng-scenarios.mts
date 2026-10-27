import { expect, type Page } from "@playwright/test";

import type { startLocalBoard } from "./localboard.mjs";

type LocalBoard = Awaited<ReturnType<typeof startLocalBoard>>;

async function openUrl(page: Page, url: string) {
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(url);
  await urlInput.press("Enter");
}

/**
 * 写真に近い画像をブラウザで作る。単色に近い画像は登録時に確認が出るため、模様を入れる。
 * 元の画像、それを縮小・再圧縮した画像、無関係な画像の3つをJPEGで返す。
 */
async function createTestImages(
  page: Page,
): Promise<Record<"original" | "recompressed" | "other", number[]>> {
  return page.evaluate(async () => {
    const toBytes = async (canvas: OffscreenCanvas, quality: number) =>
      Array.from(
        new Uint8Array(
          await (await canvas.convertToBlob({ type: "image/jpeg", quality })).arrayBuffer(),
        ),
      );

    const original = new OffscreenCanvas(640, 480);
    const context = original.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 640, 480);
    gradient.addColorStop(0, "#2a6");
    gradient.addColorStop(1, "#c42");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 640, 480);
    for (let i = 0; i < 60; i++) {
      context.fillStyle = `hsl(${(i * 37) % 360} 60% ${30 + (i % 50)}%)`;
      context.beginPath();
      context.arc((i * 211) % 640, (i * 97) % 480, 10 + (i % 40), 0, Math.PI * 2);
      context.fill();
    }

    const recompressed = new OffscreenCanvas(320, 240);
    recompressed.getContext("2d")!.drawImage(original, 0, 0, 320, 240);

    const other = new OffscreenCanvas(640, 480);
    const otherContext = other.getContext("2d")!;
    for (let x = 0; x < 640; x += 40) {
      otherContext.fillStyle = `hsl(${(x * 3) % 360} 70% ${x % 80 === 0 ? 25 : 75}%)`;
      otherContext.fillRect(x, 0, 40, 480);
    }
    otherContext.fillStyle = "#111";
    otherContext.fillRect(400, 60, 180, 120);

    return {
      original: await toBytes(original, 0.9),
      recompressed: await toBytes(recompressed, 0.5),
      other: await toBytes(other, 0.9),
    };
  });
}

/**
 * 両版で、画像の右クリック（サムネイルとビューア）から類似画像NGに登録すると、
 * 似た画像のサムネイルだけがぼかされることを確かめる。
 * 自動での画像取得（config_manual_image_loading=off）にしてから呼ぶ。
 */
export async function verifySimilarImageNgRegistration(
  page: Page,
  localBoard: LocalBoard,
): Promise<void> {
  const images = await createTestImages(page);
  localBoard.setImageBody(1, new Uint8Array(images.original), "image/jpeg");
  localBoard.setImageBody(2, new Uint8Array(images.recompressed), "image/jpeg");
  localBoard.setImageBody(3, new Uint8Array(images.other), "image/jpeg");
  localBoard.setDat(
    [
      `名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>元の画像 ${localBoard.origin}/img/1.png<>ローカルテストスレッド`,
      `名無し<>sage<>2026/10/02(金) 12:01:00 ID:local002<>再圧縮 ${localBoard.origin}/img/2.png<>`,
      `名無し<>sage<>2026/10/02(金) 12:02:00 ID:local003<>別の画像 ${localBoard.origin}/img/3.png<>`,
    ].join("\n"),
  );

  await openUrl(page, localBoard.threadUrl);
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  const thumb = (resNum: number) => panel.locator(`[data-res-num="${resNum}"] .res__thumb--image`);
  for (const resNum of [1, 2, 3]) {
    await expect
      .poll(() =>
        thumb(resNum)
          .locator("img")
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    // ルールがないうちは、判定待ちのぼかしも掛けない。
    await expect(thumb(resNum)).not.toHaveClass(/res__thumb--blurred/);
  }

  await thumb(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "類似画像NGに登録", exact: true }).click();

  await expect(thumb(1)).toHaveClass(/res__thumb--blurred/);
  await expect(thumb(2)).toHaveClass(/res__thumb--blurred/);
  // 判定が終わってからのぼかし（判定待ちではない）であることを確かめる。
  await expect(thumb(1)).not.toHaveClass(/res__thumb--hash-pending/);
  await expect(thumb(2)).not.toHaveClass(/res__thumb--hash-pending/);
  await expect(thumb(3)).not.toHaveClass(/res__thumb--blurred/);

  // 同じ画像をもう一度登録しようとしても、ルールは増えない。
  await thumb(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "類似画像NGに登録", exact: true }).click();
  await expect(page.getByText("この画像は類似画像NGに登録済みです")).toBeVisible();

  // ビューアの右クリックからも登録できる。
  await thumb(3).click();
  const viewerImage = page.locator(".media-viewer .media-viewer__image");
  await expect
    .poll(() => viewerImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await viewerImage.click({ button: "right" });
  await page.getByRole("menuitem", { name: "類似画像NGに登録", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(thumb(3)).toHaveClass(/res__thumb--blurred/);
  await expect(thumb(3)).not.toHaveClass(/res__thumb--hash-pending/);

  // 設定のNGエディタで、登録したハッシュにカーソルを合わせると、登録時の縮小画像と元のURLが出る。
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  const settings = page.locator('.content-area__tab-panel[data-active="true"]');
  await settings.getByRole("button", { name: /^NG/ }).click();
  const hashToken = settings
    .locator(".monaco-editor .view-lines span span")
    .filter({ hasText: /^"[\da-f]{16}"$/u })
    .first();
  await expect(hashToken).toBeVisible();
  await hashToken.hover();
  // Monacoは非表示のホバー要素も持つため、縮小画像を含むものに絞る。
  const hover = page.locator(".monaco-hover").filter({ has: page.locator("img") });
  const hoverImage = hover.locator("img");
  await expect(hoverImage).toHaveAttribute("src", /^data:image\/jpeg;base64,/u);
  await expect(hover).toContainText(`${localBoard.origin}/img/1.png`);
  // 編集欄の縁で切れず、縮小画像が画面内に表示されている。
  await expect
    .poll(() => hoverImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  // 縁で切れたり隠れたりしていれば、画像の中心にある要素は画像にならない。
  await expect
    .poll(() =>
      hoverImage.evaluate((image) => {
        const rect = image.getBoundingClientRect();
        return (
          rect.height > 0 &&
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === image
        );
      }),
    )
    .toBe(true);
}
