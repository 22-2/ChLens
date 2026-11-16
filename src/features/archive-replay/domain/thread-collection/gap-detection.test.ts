import { describe, expect, it } from "vite-plus/test";

import { detectThreadGaps } from "./gap-detection";

describe("スレ間の空白", () => {
  it("重なる範囲をまとめ、しきい値を超える空白だけを返す", () => {
    expect(
      detectThreadGaps(
        [
          { startSeconds: 350, endSeconds: 400 },
          { startSeconds: 0, endSeconds: 100 },
          { startSeconds: 50, endSeconds: 200 },
          { startSeconds: 320, endSeconds: 330 },
        ],
        120,
      ),
    ).toEqual([]);
    expect(
      detectThreadGaps(
        [
          { startSeconds: 0, endSeconds: 100 },
          { startSeconds: 221, endSeconds: 250 },
        ],
        120,
      ),
    ).toEqual([{ startSeconds: 100, endSeconds: 221 }]);
  });

  it("1本だけなら空白を返さず、不正な範囲を拒否する", () => {
    expect(detectThreadGaps([{ startSeconds: 0, endSeconds: 10 }], 120)).toEqual([]);
    expect(() => detectThreadGaps([{ startSeconds: 10, endSeconds: 0 }], 120)).toThrow();
  });
});
