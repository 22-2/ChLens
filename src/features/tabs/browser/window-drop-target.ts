/** 画面座標（スクリーン上のピクセル）で表した矩形。 */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type WindowGeometry = Pick<
  Window,
  "screenX" | "screenY" | "outerWidth" | "outerHeight" | "innerWidth" | "innerHeight"
>;

/** 窓全体（タイトルバーと枠を含む）の画面上の矩形。 */
export function getWindowScreenRect(win: WindowGeometry): ScreenRect {
  return { left: win.screenX, top: win.screenY, width: win.outerWidth, height: win.outerHeight };
}

export function isPointInRect(rect: ScreenRect, x: number, y: number): boolean {
  return (
    x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height
  );
}

/**
 * 画面座標を、窓の表示領域（client）の座標へ変換する。
 *
 * 変更理由: 窓の外枠とタイトルバーの大きさはAPIで直接取れないため、
 * 外寸と内寸の差から左右の枠の幅を推定し、残りを上側の装飾（タイトルバーなど）とみなす。
 * 数ピクセルの誤差は、タブの中央で前後を決める用途では問題にならない。
 */
export function screenToClientPoint(
  win: WindowGeometry,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  const frameX = Math.max(0, (win.outerWidth - win.innerWidth) / 2);
  const frameTop = Math.max(0, win.outerHeight - win.innerHeight - frameX);
  return { x: screenX - win.screenX - frameX, y: screenY - win.screenY - frameTop };
}

/** 水平タブバーでは中央より前（左）、垂直タブバーでは中央より上なら、そのタブの前へ挿入する。 */
export function isBeforeTabCenter(
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  point: { x: number; y: number },
  isVertical: boolean,
): boolean {
  return isVertical ? point.y < rect.top + rect.height / 2 : point.x < rect.left + rect.width / 2;
}

/** 新しい窓を、ドロップした位置がタブの頭あたりに来るよう置くための左上位置。 */
export function getNewWindowOrigin(
  screenX: number,
  screenY: number,
): { left: number; top: number } {
  return { left: Math.round(screenX - 120), top: Math.round(screenY - 16) };
}
