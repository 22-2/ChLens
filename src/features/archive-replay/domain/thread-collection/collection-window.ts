import type { ThreadCollectionParams, ThreadCollectionSeed } from "./types";

export interface CollectionWindow {
  startSeconds: number;
  endSeconds: number;
}

export function collectionWindowFromSeed(
  seed: ThreadCollectionSeed,
  params: ThreadCollectionParams,
): CollectionWindow {
  return createCollectionWindow(
    seed.createdAtSeconds - params.beforeSeconds,
    seed.createdAtSeconds + params.afterSeconds,
  );
}

export function createCollectionWindow(startSeconds: number, endSeconds: number): CollectionWindow {
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds > endSeconds) {
    throw new RangeError("収集する日時の範囲が不正です");
  }
  // 小数秒の範囲でも、範囲外に立ったスレのキーを混ぜない。
  return { startSeconds: Math.ceil(startSeconds), endSeconds: Math.floor(endSeconds) };
}

export function threadKeyToEpochSeconds(key: string): number | null {
  // 短い板固有の番号やミリ秒はepoch秒として扱わない。
  if (!/^[1-9]\d{9}$/.test(key)) return null;
  return Number(key);
}
