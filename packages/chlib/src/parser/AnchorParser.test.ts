// @vitest-environment node
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

  it("5桁の番号を受け入れ、6桁以上の番号や0番は対象から除く", () => {
    expect(AnchorParser.parse(">>1,99999,100000,0,3-100000")).toEqual({
      targetCount: 2,
      segments: [
        [1, 1],
        [99999, 99999],
      ],
    });
  });

  it("数字の前後に本文が混ざる文字列はアンカー全体として扱わない", () => {
    expect(AnchorParser.parse("本文>>12")).toEqual({ targetCount: 0, segments: [] });
    expect(AnchorParser.parse(">>12本文")).toEqual({ targetCount: 0, segments: [] });
  });

  it("記号を省いた番号や読点の前後の空白を含む複数範囲を解析する", () => {
    expect(AnchorParser.parse("12 、 20-21")).toEqual({
      targetCount: 3,
      segments: [
        [12, 12],
        [20, 21],
      ],
    });
  });
});
