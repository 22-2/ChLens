import {
  buildReplyIndexes,
  countReplyAnchorTargets,
  parseReplyAnchorTargets,
} from "src/core/reply-index";
import { describe, expect, it } from "vite-plus/test";

describe("reply indexes", () => {
  it("counts unique replying responses for each target", () => {
    const { repIndex, ancIndex } = buildReplyIndexes([
      { num: 2, message: "&gt;&gt;1 &gt;&gt;1" },
      { num: 3, message: "＞＞1,2" },
      { num: 4, message: "&gt;&gt;1" },
    ]);

    expect(repIndex.get(1)).toEqual(new Set([2, 3, 4]));
    expect(repIndex.get(2)).toEqual(new Set([3]));
    expect(ancIndex.get(2)).toEqual(new Set([1]));
  });

  it("uses the existing 25-target limit for range anchors", () => {
    expect(parseReplyAnchorTargets("&gt;&gt;1-25")).toHaveLength(25);
    expect(parseReplyAnchorTargets("&gt;&gt;1-26")).toEqual([]);
  });

  it("parses literal anchors from dat", () => {
    expect(parseReplyAnchorTargets(">>3,5-6")).toEqual([3, 5, 6]);
  });

  it("counts unique response targets for anchor-count", () => {
    expect(countReplyAnchorTargets("&gt;&gt;1 &gt;&gt;1,2 &gt;&gt;3-4")).toBe(4);
  });
});
