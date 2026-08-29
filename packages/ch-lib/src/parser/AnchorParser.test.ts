import { describe, expect, it } from "vite-plus/test";
import { AnchorParser } from "../parser/AnchorParser";

describe("AnchorParser", () => {
  it("単一のアンカーを解析する", () => {
    const result = AnchorParser.parse("&gt;&gt;1");
    expect(result.targetCount).toBe(1);
    expect(result.segments).toEqual([[1, 1]]);
  });

  it("dat内のアンカー文字列を解析する", () => {
    const result = AnchorParser.parse(">>3,5-6");
    expect(result.targetCount).toBe(3);
    expect(result.segments).toEqual([
      [3, 3],
      [5, 6],
    ]);
  });

  it("範囲アンカーを解析する", () => {
    const result = AnchorParser.parse("&gt;&gt;1-5");
    expect(result.targetCount).toBe(5);
    expect(result.segments).toEqual([[1, 5]]);
  });

  it("複数のアンカーを解析する", () => {
    const result = AnchorParser.parse("&gt;&gt;1,10-12");
    expect(result.targetCount).toBe(4);
    expect(result.segments).toEqual([
      [1, 1],
      [10, 12],
    ]);
  });

  it("全角数字を正規化する", () => {
    const result = AnchorParser.parse("＞＞１－３");
    expect(result.targetCount).toBe(3);
    expect(result.segments).toEqual([[1, 3]]);
  });

  it("逆順の範囲を処理する", () => {
    const result = AnchorParser.parse("&gt;&gt;5-1");
    expect(result.targetCount).toBe(5);
    expect(result.segments).toEqual([[1, 5]]);
  });

  it("不正な形式を無視する", () => {
    const result = AnchorParser.parse("abc");
    expect(result.targetCount).toBe(0);
    expect(result.segments).toEqual([]);
  });
});
