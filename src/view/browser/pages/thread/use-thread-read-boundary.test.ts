import { getReadBoundaryIndex } from "src/view/browser/pages/thread/use-thread-read-boundary";
import { describe, expect, it } from "vite-plus/test";

describe("既読と未読の区切り", () => {
  const responses = [{ num: 1 }, { num: 3 }, { num: 5 }];

  it("既読番号の次にあるレスの直前に置く", () => {
    expect(getReadBoundaryIndex(responses, 3, "auto", false)).toBe(2);
    expect(getReadBoundaryIndex(responses, 2, "auto", false)).toBe(1);
  });

  it("全件既読の場合は手動の位置だけ末尾に表示する", () => {
    expect(getReadBoundaryIndex(responses, 5, "auto", false)).toBe(-1);
    expect(getReadBoundaryIndex(responses, 5, "manual", false)).toBe(3);
  });

  it("絞り込み中、既読なし、レスなしでは表示しない", () => {
    expect(getReadBoundaryIndex(responses, 3, "auto", true)).toBe(-1);
    expect(getReadBoundaryIndex(responses, null, "auto", false)).toBe(-1);
    expect(getReadBoundaryIndex(responses, 0, "auto", false)).toBe(-1);
    expect(getReadBoundaryIndex([], 3, "manual", false)).toBe(-1);
  });
});
