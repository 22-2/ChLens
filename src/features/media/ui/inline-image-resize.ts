/**
 * 展開画像の表示幅を、画像の大きさと親の幅から決める計算。
 * DOMには触れず数値だけを扱うため、境界の値をそのままテストできる。
 */

/** ハンドルで掴める最小の幅（px）。これより狭いと操作できなくなるため下限にする。 */
const MIN_RESIZE_WIDTH_PX = 96;
/** 矢印キーで1回に変える幅（px）。 */
const RESIZE_KEY_STEP_PX = 20;

export interface ResizeBounds {
  /** 現在の画像の表示幅。 */
  width: number;
  min: number;
  max: number;
}

export interface ResizeMeasurement {
  imageWidth: number;
  imageHeight: number;
  wrapperLeft: number;
  parentRight: number;
  parentPaddingRight: number;
}

export interface ResizeDrag extends Pick<ResizeBounds, "min" | "max"> {
  startX: number;
  startWidth: number;
  current: number;
}

export type ResizeKeyDirection = 1 | -1;

/** 画像の実寸と位置から、リサイズの範囲を決める。大きさが無い画像は縦横比を決められないため扱わない。 */
export function computeResizeBounds(measurement: ResizeMeasurement): ResizeBounds | null {
  const { imageWidth, imageHeight, wrapperLeft, parentRight, parentPaddingRight } = measurement;
  if (!imageWidth || !imageHeight) return null;

  // 親の右端（内側の余白を除く）までを上限にし、本文の外へはみ出さないようにする。
  const max = Math.max(1, parentRight - wrapperLeft - parentPaddingRight);
  return {
    width: imageWidth,
    min: Math.min(MIN_RESIZE_WIDTH_PX, imageWidth, max),
    max,
  };
}

export function clampResizeWidth(value: number, { min, max }: Pick<ResizeBounds, "min" | "max">) {
  return Math.round(Math.max(min, Math.min(max, value)));
}

export function startResizeDrag(bounds: ResizeBounds, startX: number): ResizeDrag {
  return {
    startX,
    startWidth: bounds.width,
    min: bounds.min,
    max: bounds.max,
    current: bounds.width,
  };
}

/** ドラッグ中のポインタ位置から、表示幅を範囲内で更新する。 */
export function moveResizeDrag(drag: ResizeDrag, clientX: number): ResizeDrag {
  const width = drag.startWidth + (clientX - drag.startX);
  return { ...drag, current: clampResizeWidth(width, drag) };
}

export function getResizeKeyDirection(key: string): ResizeKeyDirection | null {
  if (key === "ArrowRight" || key === "ArrowUp") return 1;
  if (key === "ArrowLeft" || key === "ArrowDown") return -1;
  return null;
}

export function computeKeyboardResizeWidth(
  bounds: ResizeBounds,
  direction: ResizeKeyDirection,
): number {
  return clampResizeWidth(bounds.width + direction * RESIZE_KEY_STEP_PX, bounds);
}
