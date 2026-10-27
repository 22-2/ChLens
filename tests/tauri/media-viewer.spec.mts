import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.mjs";

interface ViewerFrame {
  time: number;
  label: string;
  scale: number;
  naturalWidth: number;
  visibility: string;
  opacity: number;
  loading: boolean;
}

async function captureViewerFrames(page: Page, count: number, action: () => Promise<void>) {
  await page.evaluate((frameCount) => {
    const target = window as typeof window & { __mediaViewerFrames: Promise<ViewerFrame[]> };
    target.__mediaViewerFrames = new Promise((resolve) => {
      const frames: ViewerFrame[] = [];
      const sample = () => {
        const image = document.querySelector<HTMLImageElement>(".media-viewer__image")!;
        const canvas = document.querySelector<HTMLElement>(".media-viewer__canvas")!;
        const style = getComputedStyle(image);
        frames.push({
          time: performance.now(),
          label: document.querySelector(".media-viewer__label")?.textContent ?? "",
          scale: Number(canvas.style.transform.match(/scale\(([^)]+)\)/u)?.[1] ?? 1),
          naturalWidth: image.naturalWidth,
          visibility: style.visibility,
          opacity: Number(style.opacity),
          loading: document.querySelector(".media-viewer__loader") !== null,
        });
        if (frames.length < frameCount) requestAnimationFrame(sample);
        else resolve(frames);
      };
      requestAnimationFrame(sample);
    });
  }, count);
  await action();
  return page.evaluate(() => {
    return (window as typeof window & { __mediaViewerFrames: Promise<ViewerFrame[]> })
      .__mediaViewerFrames;
  });
}

test("Tauriの実画像読み込みとホイール入力でも逆行や読込前の上端表示が起きない", async ({
  page,
  localBoard,
}, testInfo) => {
  const sizes = [
    { width: 400, height: 200 },
    { width: 800, height: 1600 },
    { width: 2400, height: 800 },
  ];
  const server = createServer((request, response) => {
    const index = Number(request.url?.match(/\d+/u)?.[0] ?? -1);
    const size = sizes[index];
    if (!size) {
      response.writeHead(404).end();
      return;
    }
    // 非標準ポートの画像はWebViewのCSPからRust HTTPへフォールバックする。
    // srcを外す際のネイティブerrorはDOM単体テストでは自動発火しないため実WebViewで検証する。
    setTimeout(() => {
      const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><rect width="100%" height="100%" fill="#39546f"/></svg>`;
      // 画像サイズの事前確認（HEAD）はContent-Lengthを使う。writeHeadの後にendしても自動では付かないため明示する。
      response.writeHead(200, {
        "Content-Type": "image/svg+xml",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
      });
      response.end(body);
    }, 400);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const images = sizes.map((_, index) => `${origin}/${index}.jpg`);
    // 既定の画像取得は手動（クリックで取得）のため、自動取得を前提にするこの検証では明示的にoffにする。
    await page.evaluate(() => localStorage.setItem("config_manual_image_loading", "off"));
    await page.reload();
    localBoard.setDat(`調査<>sage<>2026/10/25 ID:probe<>${images.join(" ")}<>メディア確認\n`);
    await page.getByTestId("title-bar-title").click();
    await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
    await page.getByPlaceholder("URLを入力").press("Enter");
    await page.locator('[data-res-num="1"] .res__thumb').first().click();
    await expect
      .poll(() =>
        page
          .locator(".media-viewer__image")
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBe(400);

    const stage = await page.locator(".media-viewer__stage").boundingBox();
    if (!stage) throw new Error("画像ビューアの表示領域がありません");
    await page.mouse.move(stage.x + stage.width * 0.6, stage.y + stage.height * 0.6);
    const zoom = await captureViewerFrames(page, 75, async () => {
      for (let index = 0; index < 20; index += 1) await page.mouse.wheel(0, -8);
    });
    for (let index = 1; index < zoom.length; index += 1) {
      expect(zoom[index]!.scale).toBeGreaterThanOrEqual(zoom[index - 1]!.scale - 1e-8);
    }
    expect(zoom.at(-1)!.scale).toBeGreaterThan(1.2);

    const navigation: ViewerFrame[][] = [];
    for (let index = 0; index < 6; index += 1) {
      const next = index % 2 === 0;
      const target = images[next ? 1 : 0]!;
      const frames = await captureViewerFrames(page, 45, async () => {
        await page.getByTitle(next ? "次の画像" : "前の画像", { exact: true }).click();
      });
      navigation.push(frames);
      const exposed = frames.filter(
        (frame) =>
          frame.label === target &&
          frame.naturalWidth === 0 &&
          frame.visibility === "visible" &&
          frame.opacity > 0.01 &&
          !frame.loading,
      );
      expect(exposed).toEqual([]);
      expect(frames.at(-1)!.naturalWidth).toBe(next ? 800 : 400);
    }
    // 短い間隔で元のURLへ戻り、古い取得結果が最後の画像へ混ざらないことも確認する。
    for (let index = 0; index < 6; index += 1)
      await page.keyboard.press(index % 2 === 0 ? "ArrowRight" : "ArrowLeft");
    await expect
      .poll(() =>
        page
          .locator(".media-viewer__image")
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBe(400);
    await testInfo.attach("メディア描画フレーム", {
      body: JSON.stringify({ zoom, navigation }),
      contentType: "application/json",
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
