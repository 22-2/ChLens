import {
  buildLayout,
  collectRenderIndexes,
  findIndexAt,
  getItemSize,
  getItemTop,
  getTotalSize,
  getVisibleRange,
} from "src/view/browser/utils/virtual-list/layout";
import { describe, expect, it } from "vite-plus/test";

const sizes = [10, 20, 0, 30, 40];
const layout = buildLayout(
  sizes.map((_, index) => index + 1),
  (_, index) => sizes[index]!,
);

describe("仮想リストの位置計算", () => {
  it("各項目の上端と全体の高さを累積和で求める", () => {
    expect([0, 1, 2, 3, 4].map((index) => getItemTop(layout, index))).toEqual([0, 10, 30, 30, 60]);
    expect(getItemSize(layout, 3)).toBe(30);
    expect(getTotalSize(layout)).toBe(100);
    expect(layout.indexByKey.get(4)).toBe(3);
  });

  it("位置を含む項目を二分探索で求め、範囲外は端の項目へ寄せる", () => {
    expect(findIndexAt(layout, -5)).toBe(0);
    expect(findIndexAt(layout, 0)).toBe(0);
    expect(findIndexAt(layout, 9.9)).toBe(0);
    expect(findIndexAt(layout, 10)).toBe(1);
    // 高さ0の項目（index 2）は同じ上端の次の項目に含まれる扱いになる。
    expect(findIndexAt(layout, 30)).toBe(3);
    expect(findIndexAt(layout, 99)).toBe(4);
    expect(findIndexAt(layout, 1000)).toBe(4);
    expect(
      findIndexAt(
        buildLayout([], () => 0),
        0,
      ),
    ).toBe(-1);
  });

  it("表示領域にかかる項目だけを範囲にし、境界ちょうどの次の項目は含めない", () => {
    expect(getVisibleRange(layout, 10, 20, 0)).toEqual({ start: 1, end: 2 });
    expect(getVisibleRange(layout, 15, 20, 0)).toEqual({ start: 1, end: 4 });
    expect(getVisibleRange(layout, 15, 20, 30)).toEqual({ start: 0, end: 5 });
    expect(getVisibleRange(layout, 0, 0, 100)).toEqual({ start: 0, end: 0 });
  });

  it("範囲外でも固定した項目を並び順に加え、並びにないキーは無視する", () => {
    expect(collectRenderIndexes(layout, { start: 1, end: 3 }, [5, 1, 99])).toEqual([0, 1, 2, 4]);
  });

  it("不正な高さは0として扱い、重複したキーは誤りとして止める", () => {
    const invalid = buildLayout([1, 2, 3], (key) =>
      key === 2 ? Number.NaN : -5 + Number(key) * 10,
    );
    expect(getTotalSize(invalid)).toBe(5 + 25);
    expect(() => buildLayout([1, 1], () => 10)).toThrow("重複");
  });
});
