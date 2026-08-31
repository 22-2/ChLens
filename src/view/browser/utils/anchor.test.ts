import {
  hasMissingAnchorTarget,
  parseAnchorDisplayTargets,
  parseAnchors,
} from "src/view/browser/utils/anchor";
import { describe, expect, it } from "vite-plus/test";

describe("anchor", () => {
  it("レスHTML内のアンカーを返信索引用に解析する", () => {
    expect(parseAnchors("&gt;&gt;1 &gt;3-4")).toEqual([1, 3, 4]);
  });

  it("表示アンカーの単番号・範囲・全角番号を重複なく解析する", () => {
    expect(parseAnchorDisplayTargets(">>1-3, 2, ５")).toEqual([1, 2, 3, 5]);
  });

  it("25件以上の範囲はポップアップ対象から除外する", () => {
    expect(parseAnchorDisplayTargets(">>1-26, 30")).toEqual([30]);
  });

  it("単番号・範囲・複数番号は一部でも参照先が欠ければ欠損扱いにする", () => {
    const resMap = new Map<number, unknown>([
      [1, {}],
      [2, {}],
    ]);

    expect(hasMissingAnchorTarget([1], resMap)).toBe(false);
    expect(hasMissingAnchorTarget([1, 2], resMap)).toBe(false);
    expect(hasMissingAnchorTarget([1, 3], resMap)).toBe(true);
    expect(hasMissingAnchorTarget([3], resMap)).toBe(true);
    expect(hasMissingAnchorTarget([], resMap)).toBe(false);
  });
});
