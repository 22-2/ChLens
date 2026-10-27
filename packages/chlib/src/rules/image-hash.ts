/** 類似画像NGのハッシュ（64bit、16進16桁）と一致率（%）の扱いをまとめる。 */

export const IMAGE_HASH_BITS = 64;
export const DEFAULT_IMAGE_SIMILARITY = 85;
// 無関係な画像どうしでも半分ほどのビットは偶然一致するため、50%未満はほぼすべてに当たる。
export const MIN_IMAGE_SIMILARITY = 50;
export const MAX_IMAGE_SIMILARITY = 100;

const IMAGE_HASH_PATTERN = /^[\da-f]{16}$/u;

/** 前後の空白を除いて小文字にそろえる。16進16桁でなければ null。 */
export function normalizeImageHash(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return IMAGE_HASH_PATTERN.test(normalized) ? normalized : null;
}

function popcount32(value: number): number {
  let v = value - ((value >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** 正規化済みの16進16桁どうしの、違うビットの数。 */
export function hammingDistance64(a: string, b: string): number {
  // 64bitはNumberに収まらないため、上下32bitに分けて数える。
  const high = Number.parseInt(a.slice(0, 8), 16) ^ Number.parseInt(b.slice(0, 8), 16);
  const low = Number.parseInt(a.slice(8), 16) ^ Number.parseInt(b.slice(8), 16);
  return popcount32(high) + popcount32(low);
}

/**
 * 一致率（%）を、許容する違うビットの数へ変換する。
 * 一致ビット数が ceil(64 × similarity / 100) 以上なら似ているとみなす（85% なら違いは9ビットまで）。
 */
export function maxImageHashDistance(similarity: number): number {
  return IMAGE_HASH_BITS - Math.ceil((IMAGE_HASH_BITS * similarity) / 100);
}

/** 登録したハッシュと判定する画像のハッシュが、一致率の条件を満たすか。 */
export function isSimilarImageHash(
  registered: string,
  candidate: string,
  similarity: number = DEFAULT_IMAGE_SIMILARITY,
): boolean {
  return hammingDistance64(registered, candidate) <= maxImageHashDistance(similarity);
}
