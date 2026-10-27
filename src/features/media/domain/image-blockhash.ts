import { bmvbhashEven } from "blockhash-core";

/**
 * 類似画像NGのハッシュは、画像をこの大きさ（縦横比は保たない）に描いてから計算する。
 * blockhashは縦横を8等分したブロックで比べるため、縦横比を変えても同じブロック分けになる。
 * 小さく描くのは、計算量を画像の大きさに左右されないようにするため。
 * 保存したハッシュの互換に関わるので、変えてはいけない（docs/plans/similar-image-ng-plan.md §3）。
 */
export const IMAGE_HASH_CANVAS_SIZE = 128;

// 8×8ブロック = 64bit（16進16桁）。chlibのimage条件と同じ桁数。
const IMAGE_HASH_GRID = 8;

export interface ImageHashPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

/**
 * IMAGE_HASH_CANVAS_SIZE四方のRGBAピクセルから、類似画像NGのハッシュを求める。
 * 128は8で割り切れるので、正確なbmvbhashではなく速いbmvbhashEvenで同じ結果になる。
 */
export function computeImageBlockhash(pixels: ImageHashPixels): string {
  if (pixels.width !== IMAGE_HASH_CANVAS_SIZE || pixels.height !== IMAGE_HASH_CANVAS_SIZE) {
    throw new Error(
      `類似画像NGのハッシュは${IMAGE_HASH_CANVAS_SIZE}×${IMAGE_HASH_CANVAS_SIZE}のピクセルから計算します（${pixels.width}×${pixels.height}）`,
    );
  }
  return bmvbhashEven(pixels, IMAGE_HASH_GRID);
}
