import { describe, expect, it } from "vite-plus/test";
import { AnchorParser } from "../parser/AnchorParser";

describe("AnchorParser", () => {
  it("should parse single anchor", () => {
    const result = AnchorParser.parse("&gt;&gt;1");
    expect(result.targetCount).toBe(1);
    expect(result.segments).toEqual([[1, 1]]);
  });

  it("should parse literal anchors from dat", () => {
    const result = AnchorParser.parse(">>3,5-6");
    expect(result.targetCount).toBe(3);
    expect(result.segments).toEqual([
      [3, 3],
      [5, 6],
    ]);
  });

  it("should parse range anchor", () => {
    const result = AnchorParser.parse("&gt;&gt;1-5");
    expect(result.targetCount).toBe(5);
    expect(result.segments).toEqual([[1, 5]]);
  });

  it("should parse multiple anchors", () => {
    const result = AnchorParser.parse("&gt;&gt;1,10-12");
    expect(result.targetCount).toBe(4);
    expect(result.segments).toEqual([
      [1, 1],
      [10, 12],
    ]);
  });

  it("should normalize full-width numbers", () => {
    const result = AnchorParser.parse("＞＞１－３");
    expect(result.targetCount).toBe(3);
    expect(result.segments).toEqual([[1, 3]]);
  });

  it("should handle reversed range", () => {
    const result = AnchorParser.parse("&gt;&gt;5-1");
    expect(result.targetCount).toBe(5);
    expect(result.segments).toEqual([[1, 5]]);
  });

  it("should ignore invalid formats", () => {
    const result = AnchorParser.parse("abc");
    expect(result.targetCount).toBe(0);
    expect(result.segments).toEqual([]);
  });
});
