import {
  clampResizeWidth,
  computeKeyboardResizeWidth,
  computeResizeBounds,
  getResizeKeyDirection,
  moveResizeDrag,
  type ResizeBounds,
  startResizeDrag,
} from "src/features/media/ui/inline-image-resize";
import { describe, expect, it } from "vite-plus/test";

const BOUNDS: ResizeBounds = { width: 200, min: 96, max: 400 };

describe("computeResizeBounds", () => {
  it("幅か高さが0の画像では、範囲を求めない", () => {
    const measurement = {
      imageWidth: 0,
      imageHeight: 100,
      wrapperLeft: 100,
      parentRight: 500,
      parentPaddingRight: 0,
    };

    expect(computeResizeBounds(measurement)).toBeNull();
    expect(computeResizeBounds({ ...measurement, imageWidth: 200, imageHeight: 0 })).toBeNull();
  });

  it("上限は親の右端から、枠の左端と親の右側の余白を引いた幅になる", () => {
    const bounds = computeResizeBounds({
      imageWidth: 200,
      imageHeight: 100,
      wrapperLeft: 100,
      parentRight: 500,
      parentPaddingRight: 16,
    });

    expect(bounds).toEqual({ width: 200, min: 96, max: 384 });
  });

  it("親の右端が枠より左にあっても、上限は1pxを下回らない", () => {
    const bounds = computeResizeBounds({
      imageWidth: 200,
      imageHeight: 100,
      wrapperLeft: 300,
      parentRight: 50,
      parentPaddingRight: 0,
    });

    expect(bounds).toEqual({ width: 200, min: 1, max: 1 });
  });

  it("画像が標準の下限より狭いときは、画像の幅を下限にする", () => {
    const bounds = computeResizeBounds({
      imageWidth: 80,
      imageHeight: 60,
      wrapperLeft: 100,
      parentRight: 500,
      parentPaddingRight: 0,
    });

    expect(bounds).toEqual({ width: 80, min: 80, max: 400 });
  });
});

describe("clampResizeWidth", () => {
  it("範囲内の値はそのまま返す", () => {
    expect(clampResizeWidth(250, BOUNDS)).toBe(250);
  });

  it("下限より小さい値は下限に、上限より大きい値は上限に収める", () => {
    expect(clampResizeWidth(10, BOUNDS)).toBe(96);
    expect(clampResizeWidth(900, BOUNDS)).toBe(400);
  });

  it("小数の幅は四捨五入して整数にする", () => {
    expect(clampResizeWidth(100.4, BOUNDS)).toBe(100);
    expect(clampResizeWidth(100.6, BOUNDS)).toBe(101);
  });
});

describe("ドラッグによるリサイズ", () => {
  it("開始時点の幅を現在の幅として持つ", () => {
    const drag = startResizeDrag(BOUNDS, 100);

    expect(drag).toEqual({ startX: 100, startWidth: 200, min: 96, max: 400, current: 200 });
  });

  it("ポインタを右へ動かした分だけ幅を広げる", () => {
    const drag = startResizeDrag(BOUNDS, 100);

    expect(moveResizeDrag(drag, 150).current).toBe(250);
  });

  it("ポインタを開始位置へ戻すと、元の幅に戻る", () => {
    const drag = startResizeDrag(BOUNDS, 100);

    expect(moveResizeDrag(moveResizeDrag(drag, 180), 100).current).toBe(200);
  });

  it("上限や下限を超えるポインタ位置では、範囲の端で止める", () => {
    const drag = startResizeDrag(BOUNDS, 100);

    expect(moveResizeDrag(drag, 1_000).current).toBe(400);
    expect(moveResizeDrag(drag, -1_000).current).toBe(96);
  });

  it("移動しても元のドラッグ状態は変えない", () => {
    const drag = startResizeDrag(BOUNDS, 100);

    moveResizeDrag(drag, 150);

    expect(drag.current).toBe(200);
  });
});

describe("キーボードによるリサイズ", () => {
  it.each([
    ["ArrowRight", 1],
    ["ArrowUp", 1],
    ["ArrowLeft", -1],
    ["ArrowDown", -1],
  ] as const)("キー %s は向き %s として扱う", (key, direction) => {
    expect(getResizeKeyDirection(key)).toBe(direction);
  });

  it("リサイズに使わないキーは、向きを返さない", () => {
    expect(getResizeKeyDirection("Enter")).toBeNull();
    expect(getResizeKeyDirection("a")).toBeNull();
  });

  it("向きに応じて20pxずつ幅を変える", () => {
    expect(computeKeyboardResizeWidth(BOUNDS, 1)).toBe(220);
    expect(computeKeyboardResizeWidth(BOUNDS, -1)).toBe(180);
  });

  it("上限と下限を超える場合は範囲の端で止める", () => {
    expect(computeKeyboardResizeWidth({ width: 390, min: 96, max: 400 }, 1)).toBe(400);
    expect(computeKeyboardResizeWidth({ width: 100, min: 96, max: 400 }, -1)).toBe(96);
  });
});
