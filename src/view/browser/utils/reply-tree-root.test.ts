import { describe, expect, it } from "vitest";
import { resolveReplyTreeRootResNum } from "src/view/browser/utils/reply-tree-root";

describe("resolveReplyTreeRootResNum", () => {
  it("単純なアンカー連鎖で最古レスを返す", () => {
    const ancIndex = new Map<number, Set<number>>([
      [270, new Set([260])],
      [260, new Set([240])],
      [240, new Set([120])],
    ]);
    const resMap = new Map<number, unknown>([
      [120, {}],
      [240, {}],
      [260, {}],
      [270, {}],
    ]);

    expect(resolveReplyTreeRootResNum(270, ancIndex, resMap)).toBe(120);
  });

  it("相互アンカーの循環があっても停止して最小番号を返す", () => {
    const ancIndex = new Map<number, Set<number>>([
      [270, new Set([260])],
      [260, new Set([270, 250])],
      [250, new Set([240])],
    ]);
    const resMap = new Map<number, unknown>([
      [240, {}],
      [250, {}],
      [260, {}],
      [270, {}],
    ]);

    expect(resolveReplyTreeRootResNum(270, ancIndex, resMap)).toBe(240);
  });

  it("存在しない参照先は無視して開始レスを維持する", () => {
    const ancIndex = new Map<number, Set<number>>([[300, new Set([9999])]]);
    const resMap = new Map<number, unknown>([[300, {}]]);

    expect(resolveReplyTreeRootResNum(300, ancIndex, resMap)).toBe(300);
  });

  it("密な相互アンカーでも直接参照チェーンに沿って解決する", () => {
    const ancIndex = new Map<number, Set<number>>([
      [270, new Set([260, 120, 40])],
      [260, new Set([250, 39])],
      [250, new Set([240, 260])],
      [240, new Set([230])],
      [230, new Set([220])],
      [220, new Set([210])],
      [210, new Set([200])],
      // ここから先はスレ全体へ繋がる相互参照を模したノイズ
      [200, new Set([10, 199, 198, 197])],
      [199, new Set([200, 10])],
      [198, new Set([200, 11])],
    ]);
    const resMap = new Map<number, unknown>(
      Array.from({ length: 271 }, (_v, n) => [n, {}]),
    );

    // 270 の直接参照候補の最小(40)へ寄せることで、
    // グラフ全体探索を避けてスレ全域への過剰展開を防ぐ。
    expect(resolveReplyTreeRootResNum(270, ancIndex, resMap)).toBe(40);
  });
});
