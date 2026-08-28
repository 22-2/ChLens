/**
 * マウスジェスチャーの入力要約だけを扱う。
 * DOMイベントの購読はhook側に残し、方向判定を独立させることで、入力イベントと
 * スクロールUIの責務が混ざらないようにする。
 */

export type GestureDirection = "Up" | "Down";

export interface GesturePoint {
  x: number;
  y: number;
}

export const GESTURE_START_THRESHOLD = 12;
export const GESTURE_CONTEXTMENU_SUPPRESS_MS = 400;

export function summarizeVerticalGesture(
  points: GesturePoint[],
): { direction: GestureDirection; distance: number } | null {
  if (points.length < 2) {
    return null;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const totalDx = end.x - start.x;
  const totalDy = end.y - start.y;
  const distance = Math.hypot(totalDx, totalDy);

  if (distance < 10) {
    return null;
  }

  if (Math.abs(totalDy) <= Math.abs(totalDx)) {
    return null;
  }

  return {
    direction: totalDy < 0 ? "Up" : "Down",
    distance,
  };
}
