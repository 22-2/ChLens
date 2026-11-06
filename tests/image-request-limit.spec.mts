import { crc32, deflateSync } from "node:zlib";

import { expect, test } from "./fixtures.mjs";
import {
  openThreadFromBoard,
  waitForScrollSettled,
  waitForThreadLoaded,
} from "./thread-scroll-helpers.mjs";

const IMAGE_RESPONSE_COUNT = 600;
const ACTIVE_PANEL = '.content-area__tab-panel[data-active="true"]';

/** 圧縮が効かないノイズ画像。約1MBの有効なPNGを作る。 */
function createNoisePng(size: number): Uint8Array {
  const rowBytes = size * 3 + 1;
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    for (let x = 1; x < rowBytes; x++) raw[y * rowBytes + x] = Math.floor(Math.random() * 256);
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // ビット深度
  header[9] = 2; // RGB
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw, { level: 0 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

test("画像の多いスレを高速にスクロールしても、通り過ぎた画像は取得しない", async ({
  page,
  extensionId,
  localBoard,
}) => {
  // 変更理由: 1MB級の画像が数百枚あるスレを速くスクロールすると、通り過ぎた画像まで
  // 取得を始め、短時間に数十MBの通信が走っていた。画面にとどまった画像だけ取得する。
  const thread = localBoard.addLargeThread(1);
  const png = createNoisePng(590);
  const lines = Array.from({ length: IMAGE_RESPONSE_COUNT }, (_, index) => {
    const resNum = index + 1;
    const image = resNum % 2 === 0 ? `${localBoard.origin}/img/${resNum}.png` : "";
    if (image) localBoard.setImageBody(resNum, png, "image/png");
    return `名無し<>sage<>2026/10/02(金) 12:00:00 ID:id${resNum % 97}<>レス本文${resNum} <br> ${image}<>${resNum === 1 ? thread.title : ""}`;
  });
  localBoard.setDat(lines.join("\n"), thread.threadId);
  await page.addInitScript(() => localStorage.setItem("config_manual_image_loading", "off"));

  await openThreadFromBoard(page, extensionId, localBoard.boardUrl, thread.title);
  await waitForThreadLoaded(page, thread.threadUrl, IMAGE_RESPONSE_COUNT, 60_000);
  await waitForScrollSettled(page);

  const countImageRequests = () => {
    let heads = 0;
    let gets = 0;
    localBoard.requests.forEach((path, index) => {
      if (!path.startsWith("/img/")) return;
      if (localBoard.requestMethods[index] === "HEAD") heads++;
      else gets++;
    });
    return { heads, gets };
  };
  // 先頭付近の画像は、とどまっているので取得される。
  await expect.poll(() => countImageRequests().gets).toBeGreaterThan(0);
  const beforeSweep = countImageRequests();

  // 約1.5秒で先頭から末尾まで通り過ぎる。
  const panel = page.locator(ACTIVE_PANEL);
  const scrollRange = await panel.evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  );
  const steps = 30;
  for (let step = 1; step <= steps; step++) {
    await panel.evaluate((element, top) => (element.scrollTop = top), (scrollRange * step) / steps);
    await page.waitForTimeout(50);
  }
  // 末尾にとどまった画像の取得を待つ。
  await expect
    .poll(() => panel.locator(".res img").evaluateAll((images) => images.length))
    .toBeGreaterThan(0);
  await page.waitForTimeout(1_000);

  const afterSweep = countImageRequests();
  const sweptHeads = afterSweep.heads - beforeSweep.heads;
  const sweptGets = afterSweep.gets - beforeSweep.gets;
  // 画面に収まる枚数（数枚）と余裕分まで。通り過ぎた約300枚を取得していれば大きく超える。
  expect(sweptHeads).toBeLessThanOrEqual(15);
  expect(sweptGets).toBeLessThanOrEqual(15);
});
