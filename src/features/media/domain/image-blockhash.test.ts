// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { computeImageBlockhash, IMAGE_HASH_CANVAS_SIZE } from "./image-blockhash";

const SIZE = IMAGE_HASH_CANVAS_SIZE;

function pixels(color: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      data.set(color(x, y), (y * SIZE + x) * 4);
    }
  }
  return { width: SIZE, height: SIZE, data };
}

const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const BLACK: [number, number, number, number] = [0, 0, 0, 255];

describe("類似画像NGのハッシュ計算", () => {
  // 保存したハッシュの互換を守るため、ライブラリや手順を変えたら気付けるよう具体的な値で確かめる。
  it("左半分が白い画像は、各行の左4ブロックが1になる", () => {
    expect(computeImageBlockhash(pixels((x) => (x < SIZE / 2 ? WHITE : BLACK)))).toBe(
      "f0f0f0f0f0f0f0f0",
    );
  });

  it("上半分が白い画像は、上4行のブロックが1になる", () => {
    expect(computeImageBlockhash(pixels((_, y) => (y < SIZE / 2 ? WHITE : BLACK)))).toBe(
      "ffffffff00000000",
    );
  });

  it("完全に透明なピクセルは白として扱う", () => {
    const transparent: [number, number, number, number] = [0, 0, 0, 0];
    expect(computeImageBlockhash(pixels((x) => (x < SIZE / 2 ? transparent : BLACK)))).toBe(
      computeImageBlockhash(pixels((x) => (x < SIZE / 2 ? WHITE : BLACK))),
    );
  });

  it("決めた大きさ以外のピクセルは受け付けない", () => {
    expect(() =>
      computeImageBlockhash({ width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) }),
    ).toThrow("128×128");
  });
});
