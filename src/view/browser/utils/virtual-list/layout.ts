/**
 * 可変高さの仮想リストで、各項目の位置を高さの累積和として持つ。
 *
 * 位置はDOMを測らずにこの配列だけから決めるため、描画範囲の計算・ジャンプ先・
 * スクロール位置の補正が、どの項目がマウントされているかに左右されない。
 */
export type VirtualKey = string | number;

export interface VirtualLayout {
  readonly keys: readonly VirtualKey[];
  /** offsets[i] は項目iの上端。末尾の offsets[keys.length] は全体の高さ。 */
  readonly offsets: Float64Array;
  readonly indexByKey: ReadonlyMap<VirtualKey, number>;
}

/** 描画する項目の範囲。start は含み、end は含まない。 */
export interface VirtualRange {
  start: number;
  end: number;
}

export function buildLayout(
  keys: readonly VirtualKey[],
  getSize: (key: VirtualKey, index: number) => number,
): VirtualLayout {
  const offsets = new Float64Array(keys.length + 1);
  const indexByKey = new Map<VirtualKey, number>();
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index]!;
    if (indexByKey.has(key)) {
      // 同じキーが二つあると位置の引き当てとサイズのキャッシュが混ざるため、呼び出し側の誤りとして止める。
      throw new Error(`仮想リストのキーが重複しています: ${String(key)}`);
    }
    indexByKey.set(key, index);
    // 負の値やNaNを足すと以降の位置がすべて壊れるため、0として扱う。
    const size = getSize(key, index);
    offsets[index + 1] = offsets[index]! + (Number.isFinite(size) && size > 0 ? size : 0);
  }
  return { keys, offsets, indexByKey };
}

export function getTotalSize(layout: VirtualLayout): number {
  return layout.offsets[layout.keys.length]!;
}

export function getItemTop(layout: VirtualLayout, index: number): number {
  return layout.offsets[index]!;
}

export function getItemSize(layout: VirtualLayout, index: number): number {
  return layout.offsets[index + 1]! - layout.offsets[index]!;
}

/**
 * 位置 y を含む項目の番号を二分探索で返す。範囲外は先頭・末尾へ寄せ、項目がなければ -1。
 */
export function findIndexAt(layout: VirtualLayout, y: number): number {
  const count = layout.keys.length;
  if (count === 0) return -1;
  if (y >= getTotalSize(layout)) return count - 1;
  const target = Math.max(0, y);

  // offsets[i] <= y を満たす最大の i を探す。高さ0の項目は次の項目と上端が同じなので、自然に飛ばされる。
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (layout.offsets[middle]! <= target) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** 表示領域 [top, top + height) にかかる項目に、上下 overscanPx ぶんの余白を足した範囲。 */
export function getVisibleRange(
  layout: VirtualLayout,
  top: number,
  height: number,
  overscanPx: number,
): VirtualRange {
  const count = layout.keys.length;
  if (count === 0 || height <= 0) return { start: 0, end: 0 };
  const start = findIndexAt(layout, Math.max(0, top - overscanPx));
  const bottom = top + height + overscanPx;
  let end = findIndexAt(layout, bottom) + 1;
  // bottom がちょうど項目の境界にあるときは、そこから始まる項目（高さ0を含む）まで含めなくてよい。
  while (end - 1 > start && layout.offsets[end - 1]! >= bottom) end -= 1;
  return { start, end: Math.min(count, end) };
}

/** 範囲内の項目と、範囲外でも描画し続ける項目（選択中など）を、並び順にまとめる。 */
export function collectRenderIndexes(
  layout: VirtualLayout,
  range: VirtualRange,
  pinnedKeys: Iterable<VirtualKey>,
): number[] {
  const indexes = new Set<number>();
  for (let index = range.start; index < range.end; index++) indexes.add(index);
  for (const key of pinnedKeys) {
    const index = layout.indexByKey.get(key);
    if (index !== undefined) indexes.add(index);
  }
  return [...indexes].sort((a, b) => a - b);
}
