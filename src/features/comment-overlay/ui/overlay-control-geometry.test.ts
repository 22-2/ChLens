import { describe, expect, it } from "vite-plus/test";

import { COMMENT_OVERLAY_ASPECT_RATIO } from "../platform/types";
import {
  clampGeometry,
  MIN_WIDTH,
  monitorContainsPoint,
  movedGeometry,
  resizedGeometry,
  selectionGeometry,
} from "./overlay-control-geometry";

const bounds = { x: 0, y: 0, width: 1920, height: 1080 };

describe("clampGeometry", () => {
  it("画面からはみ出す位置を、画面内へ押し戻す", () => {
    const result = clampGeometry({ x: 1800, y: 1000, width: 400, height: 225 }, bounds);
    expect(result.x + result.width).toBeLessThanOrEqual(bounds.width);
    expect(result.y + result.height).toBeLessThanOrEqual(bounds.height);
  });

  it("縦横比を固定すると、幅と高さが16:9になる", () => {
    const result = clampGeometry({ x: 0, y: 0, width: 800, height: 800 }, bounds, true);
    expect(result.width / result.height).toBeCloseTo(COMMENT_OVERLAY_ASPECT_RATIO, 1);
  });
});

describe("movedGeometry", () => {
  it("移動してもサイズは変えず、位置だけをずらす", () => {
    const origin = { x: 100, y: 100, width: 640, height: 360 };
    const result = movedGeometry(origin, { x: 0, y: 0 }, { x: 50, y: 20 }, bounds);
    expect(result).toEqual({ x: 150, y: 120, width: 640, height: 360 });
  });
});

describe("selectionGeometry", () => {
  it("左上へドラッグすると、開始点を右下の角にした範囲になる", () => {
    const result = selectionGeometry({ x: 800, y: 600 }, { x: 400, y: 300 }, bounds, false);
    expect(result).toMatchObject({ x: 400, y: 300, width: 400, height: 300 });
  });

  it("最小幅より小さくは選べない（縦横比固定）", () => {
    const result = selectionGeometry({ x: 100, y: 100 }, { x: 110, y: 110 }, bounds, true);
    expect(result.width).toBeGreaterThanOrEqual(MIN_WIDTH);
  });
});

describe("resizedGeometry", () => {
  const origin = { x: 200, y: 200, width: 640, height: 360 };

  it("東の辺を動かすと、幅だけが変わる", () => {
    const result = resizedGeometry(origin, { x: 0, y: 0 }, { x: 100, y: 0 }, "East", bounds, false);
    expect(result).toMatchObject({ x: 200, y: 200, width: 740, height: 360 });
  });

  it("西の辺を最小幅まで縮めても、反対側（東）の辺は動かない", () => {
    const result = resizedGeometry(origin, { x: 0, y: 0 }, { x: 600, y: 0 }, "West", bounds, false);
    expect(result.width).toBe(MIN_WIDTH);
    expect(result.x + result.width).toBe(origin.x + origin.width);
  });
});

describe("monitorContainsPoint", () => {
  const monitor = { x: 0, y: 0, width: 100, height: 100 } as Parameters<
    typeof monitorContainsPoint
  >[0];

  it("境界を含めて、点がモニター内にあるかを判定する", () => {
    expect(monitorContainsPoint(monitor, { x: 100, y: 0 })).toBe(true);
    expect(monitorContainsPoint(monitor, { x: 101, y: 0 })).toBe(false);
  });
});
