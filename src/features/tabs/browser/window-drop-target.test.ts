import {
  getNewWindowOrigin,
  getWindowScreenRect,
  isBeforeTabCenter,
  isPointInRect,
  screenToClientPoint,
} from "src/features/tabs/browser/window-drop-target";
import { describe, expect, it } from "vite-plus/test";

const geometry = {
  screenX: 100,
  screenY: 50,
  outerWidth: 1000,
  outerHeight: 800,
  innerWidth: 984,
  innerHeight: 740,
};

describe("窓をまたぐドロップ先の判定", () => {
  it("窓の外寸の矩形に含まれる点だけを窓内とみなす", () => {
    const rect = getWindowScreenRect(geometry);
    expect(isPointInRect(rect, 100, 50)).toBe(true);
    expect(isPointInRect(rect, 1099, 849)).toBe(true);
    expect(isPointInRect(rect, 1100, 400)).toBe(false);
    expect(isPointInRect(rect, 99, 400)).toBe(false);
    expect(isPointInRect(rect, 500, 850)).toBe(false);
  });

  it("負の座標にある別モニターの窓も判定できる", () => {
    const rect = getWindowScreenRect({ ...geometry, screenX: -1200 });
    expect(isPointInRect(rect, -900, 300)).toBe(true);
    expect(isPointInRect(rect, 100, 300)).toBe(false);
  });

  it("画面座標を表示領域の座標へ変換する", () => {
    // 左右の枠は8px、上側の装飾は 800 - 740 - 8 = 52px。
    expect(screenToClientPoint(geometry, 108, 102)).toEqual({ x: 0, y: 0 });
    expect(screenToClientPoint(geometry, 308, 202)).toEqual({ x: 200, y: 100 });
  });

  it("枠がない窓では外寸と内寸が同じとして扱う", () => {
    const frameless = { ...geometry, innerWidth: 1000, innerHeight: 800 };
    expect(screenToClientPoint(frameless, 150, 70)).toEqual({ x: 50, y: 20 });
  });

  it("タブの中央を境に、挿入位置を前後へ分ける", () => {
    const rect = { left: 100, top: 10, width: 80, height: 30 };
    expect(isBeforeTabCenter(rect, { x: 139, y: 20 }, false)).toBe(true);
    expect(isBeforeTabCenter(rect, { x: 140, y: 20 }, false)).toBe(false);
    expect(isBeforeTabCenter(rect, { x: 500, y: 24 }, true)).toBe(true);
    expect(isBeforeTabCenter(rect, { x: 500, y: 25 }, true)).toBe(false);
  });

  it("新しい窓の位置は、離した点の近くに置く", () => {
    expect(getNewWindowOrigin(500, 300)).toEqual({ left: 380, top: 284 });
  });
});
