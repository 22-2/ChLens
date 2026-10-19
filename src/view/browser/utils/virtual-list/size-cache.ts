import type { VirtualKey } from "src/view/browser/utils/virtual-list/layout";

/**
 * 項目ごとの実測高さを、測ったときの描画条件（シグネチャ）と一緒に覚える。
 *
 * 幅や表示モードが変わると同じ項目でも高さが変わるため、シグネチャが一致するときだけ
 * 実測値として使う。一致しない古い値も推定の材料になるので、上書きされるまで残す。
 */
export interface SizeEntry {
  size: number;
  signature: string;
}

export interface SizeCache {
  /** シグネチャが一致する実測値。なければ undefined。 */
  get(key: VirtualKey, signature: string): number | undefined;
  /** シグネチャを問わず最後に測った値。推定値の補正に使う。 */
  peek(key: VirtualKey): SizeEntry | undefined;
  /** 値が変わったときだけ true を返す。 */
  set(key: VirtualKey, signature: string, size: number): boolean;
  /** 指定したキー以外を捨てる。スレッドから消えた項目の分だけメモリを持ち続けないため。 */
  retain(keys: Iterable<VirtualKey>): void;
  readonly size: number;
}

/** 高さの差がこれ未満なら同じ値として扱う。小数の丸めで補正が延々と続くのを防ぐ。 */
const SIZE_EPSILON = 0.5;

export function createSizeCache(): SizeCache {
  const entries = new Map<VirtualKey, SizeEntry>();
  return {
    get(key, signature) {
      const entry = entries.get(key);
      return entry?.signature === signature ? entry.size : undefined;
    },
    peek(key) {
      return entries.get(key);
    },
    set(key, signature, size) {
      const entry = entries.get(key);
      if (entry?.signature === signature && Math.abs(entry.size - size) < SIZE_EPSILON) {
        return false;
      }
      entries.set(key, { size, signature });
      return true;
    },
    retain(keys) {
      const keep = new Set(keys);
      for (const key of entries.keys()) {
        if (!keep.has(key)) entries.delete(key);
      }
    },
    get size() {
      return entries.size;
    },
  };
}
