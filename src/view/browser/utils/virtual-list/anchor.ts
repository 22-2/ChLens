import {
  findIndexAt,
  getItemSize,
  getItemTop,
  type VirtualKey,
  type VirtualLayout,
} from "src/view/browser/utils/virtual-list/layout";

/**
 * スクロール位置を「どの項目の、どこを見ているか」で表す。
 *
 * scrollTop の数値だけを覚えると、上にある項目の高さが変わったときに見ている内容がずれる。
 * 表示領域の上端にかかる項目と、その項目の上端から表示領域の上端までの距離で覚えておけば、
 * 高さが変わったあとも同じ内容が同じ場所に見えるよう scrollTop を逆算できる。
 * ブラウザ標準のスクロールアンカリング（CSS overflow-anchor）と同じ考え方。
 */
export type ScrollAnchor =
  | {
      kind: "item";
      key: VirtualKey;
      /** 項目の上端から表示領域の上端までの距離。表示領域の上端より下に項目があるときは負。 */
      offset: number;
      /** 取得したときの並び順。キーが並びから消えたとき、近くの項目へ移るために使う。 */
      index: number;
    }
  | { kind: "end" };

/** リスト内の座標系での表示領域。top はリストの上端からのスクロール量。 */
export interface ListViewport {
  top: number;
  height: number;
}

export function captureItemAnchor(
  layout: VirtualLayout,
  viewport: ListViewport,
): ScrollAnchor | null {
  const index = findIndexAt(layout, viewport.top);
  if (index < 0) return null;
  return {
    kind: "item",
    key: layout.keys[index]!,
    offset: viewport.top - getItemTop(layout, index),
    index,
  };
}

export function isAtEnd(viewport: ListViewport, bounds: TopBounds, threshold: number): boolean {
  return bounds.max - viewport.top <= threshold;
}

/** リスト内の座標系で、scrollTop として取りうる範囲。 */
export interface TopBounds {
  min: number;
  max: number;
}

/**
 * アンカーが指す内容を同じ位置に見せるための、リスト内の scrollTop を返す。
 * キーが並びから消えていれば、取得時の並び順に近い項目の先頭へ合わせる。
 *
 * bounds はリストの外（上の固定ヘッダや下の余白）を含めたスクロール可能な範囲で、
 * リストより上が見えている状態（top が負）もそのまま再現できるようにする。
 */
export function resolveAnchorTop(
  layout: VirtualLayout,
  anchor: ScrollAnchor,
  bounds: TopBounds,
  orderOf?: (key: VirtualKey) => number,
): number {
  if (anchor.kind === "end") return bounds.max;
  if (layout.keys.length === 0) return clamp(0, bounds);

  const index = layout.indexByKey.get(anchor.key);
  if (index !== undefined) {
    // 項目の高さが縮んで offset が項目の外へはみ出しても、見ていた項目の範囲内へは収める。
    const size = getItemSize(layout, index);
    const offset = Math.min(anchor.offset, Math.max(0, size - 1));
    return clamp(getItemTop(layout, index) + offset, bounds);
  }

  const fallbackIndex = findFallbackIndex(layout, anchor, orderOf);
  return clamp(getItemTop(layout, fallbackIndex), bounds);
}

function findFallbackIndex(
  layout: VirtualLayout,
  anchor: Extract<ScrollAnchor, { kind: "item" }>,
  orderOf: ((key: VirtualKey) => number) | undefined,
): number {
  const count = layout.keys.length;
  if (orderOf) {
    // 絞り込みでアンカーのレスが消えたときは、その次に並ぶレスを見せる（読んでいた続きから再開できる）。
    const anchorOrder = orderOf(anchor.key);
    for (let index = 0; index < count; index++) {
      if (orderOf(layout.keys[index]!) >= anchorOrder) return index;
    }
    return count - 1;
  }
  return Math.min(Math.max(0, anchor.index), count - 1);
}

function clamp(value: number, bounds: TopBounds): number {
  // 内容が表示領域より短いと max < min になるため、その場合は min を優先する。
  return Math.max(bounds.min, Math.min(value, bounds.max));
}
