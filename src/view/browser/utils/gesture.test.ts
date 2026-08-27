import { summarizeVerticalGesture } from "src/view/browser/utils/gesture";
import { describe, expect, it } from "vite-plus/test";

describe("gesture", () => {
  it("上方向と下方向のジェスチャーを判定する", () => {
    const upward = summarizeVerticalGesture([
      { x: 0, y: 100 },
      { x: 2, y: 50 },
    ]);
    const downward = summarizeVerticalGesture([
      { x: 0, y: 0 },
      { x: 2, y: 50 },
    ]);

    expect(upward?.direction).toBe("Up");
    expect(upward?.distance).toBeCloseTo(50.04, 2);
    expect(downward?.direction).toBe("Down");
    expect(downward?.distance).toBeCloseTo(50.04, 2);
  });

  it("短い動きや横方向の動きはジェスチャーにしない", () => {
    expect(
      summarizeVerticalGesture([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBeNull();
    expect(
      summarizeVerticalGesture([
        { x: 0, y: 0 },
        { x: 20, y: 1 },
      ]),
    ).toBeNull();
  });
});
