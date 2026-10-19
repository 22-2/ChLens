import {
  captureItemAnchor,
  isAtEnd,
  resolveAnchorTop,
} from "src/view/browser/utils/virtual-list/anchor";
import { buildLayout } from "src/view/browser/utils/virtual-list/layout";
import { describe, expect, it } from "vite-plus/test";

function layoutOf(entries: Array<[number, number]>) {
  const sizes = new Map(entries);
  return buildLayout(
    entries.map(([key]) => key),
    (key) => sizes.get(key as number)!,
  );
}

const bounds = { min: 0, max: 10_000 };

describe("スクロール位置のアンカー", () => {
  it("表示領域の上端にかかる項目と、その中の位置を覚える", () => {
    const layout = layoutOf([
      [1, 100],
      [2, 100],
      [3, 100],
    ]);
    expect(captureItemAnchor(layout, { top: 150, height: 50 })).toEqual({
      kind: "item",
      key: 2,
      offset: 50,
      index: 1,
    });
  });

  it("上にある項目の高さが変わっても、同じ項目の同じ位置を指す scrollTop を返す", () => {
    const before = layoutOf([
      [1, 100],
      [2, 100],
      [3, 100],
    ]);
    const anchor = captureItemAnchor(before, { top: 150, height: 50 })!;
    const after = layoutOf([
      [1, 340],
      [2, 100],
      [3, 100],
    ]);
    expect(resolveAnchorTop(after, anchor, bounds)).toBe(390);
  });

  it("アンカーの項目が縮んだときは、その項目の範囲内へ収める", () => {
    const anchor = { kind: "item", key: 2, offset: 90, index: 1 } as const;
    const layout = layoutOf([
      [1, 100],
      [2, 20],
    ]);
    expect(resolveAnchorTop(layout, anchor, bounds)).toBe(119);
  });

  it("絞り込みでアンカーの項目が消えたら、並び順で次の項目の先頭へ移る", () => {
    const anchor = { kind: "item", key: 5, offset: 30, index: 4 } as const;
    const filtered = layoutOf([
      [2, 100],
      [4, 100],
      [8, 100],
    ]);
    expect(resolveAnchorTop(filtered, anchor, bounds, (key) => key as number)).toBe(200);
    // 並び順が分からなければ、取得時の並び番号に近い項目を選ぶ。
    expect(resolveAnchorTop(filtered, anchor, bounds)).toBe(200);
    const beforeAll = { kind: "item", key: 9, offset: 0, index: 0 } as const;
    expect(resolveAnchorTop(filtered, beforeAll, bounds, (key) => key as number)).toBe(200);
  });

  it("末尾のアンカーは最大位置を返し、スクロールできる範囲の外へは出さない", () => {
    const layout = layoutOf([
      [1, 100],
      [2, 100],
    ]);
    expect(resolveAnchorTop(layout, { kind: "end" }, { min: -40, max: 160 })).toBe(160);
    const anchor = { kind: "item", key: 2, offset: 0, index: 1 } as const;
    expect(resolveAnchorTop(layout, anchor, { min: -40, max: 60 })).toBe(60);
    // リストより上の固定ヘッダが見えている状態（負の位置）もそのまま再現する。
    const header = { kind: "item", key: 1, offset: -30, index: 0 } as const;
    expect(resolveAnchorTop(layout, header, { min: -40, max: 160 })).toBe(-30);
  });

  it("最下部との距離がしきい値以下なら最下部にいると判定する", () => {
    expect(isAtEnd({ top: 159, height: 40 }, { min: 0, max: 160 }, 1)).toBe(true);
    expect(isAtEnd({ top: 150, height: 40 }, { min: 0, max: 160 }, 1)).toBe(false);
  });
});
