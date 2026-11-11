import {
  ANCHOR_PREVIEW_GUTTER,
  ANCHOR_PREVIEW_MAX_WIDTH,
  ANCHOR_PREVIEW_OFFSET,
} from "src/view/browser/utils/constants";
import type { PopupViewportBounds } from "src/view/browser/utils/use-adjust-overflow";

/** 子ポップアップを親の左端からずらす量。親のレス番号を見えるようにする。 */
export const CHILD_POPUP_OFFSET = 40;

/**
 * ポップアップを開くきっかけになった場所（viewport座標）。
 * クリックなら点、アンカーのホバーならアンカーの矩形の左下を渡す。
 */
export interface PopupTrigger {
  left: number;
  bottom: number;
}

export function triggerFromPoint(clientX: number, clientY: number): PopupTrigger {
  return { left: clientX, bottom: clientY };
}

export interface ResolvePopupPositionInput {
  trigger: PopupTrigger;
  /** 親ポップアップの実際の表示位置。親がなければ undefined。 */
  parentRect?: Pick<DOMRect, "left">;
  viewport: Pick<PopupViewportBounds, "right" | "bottom">;
}

/**
 * ID・返信ツリー・アンカーのポップアップに共通の配置規則。
 *
 * 子の横位置は親の左端からずらし、縦位置は操作場所の直下にする。
 * 親の下側から開いても上端へ飛ばないよう、縦位置には親の座標を使わない。
 * - どちらも画面内に収める。表示後の寸法による補正は FloatingPopup の useAdjustOverflow が行う。
 */
export function resolvePopupPosition({
  trigger,
  parentRect,
  viewport,
}: ResolvePopupPositionInput): { x: number; y: number } {
  const maxWidth = Math.min(ANCHOR_PREVIEW_MAX_WIDTH, viewport.right - ANCHOR_PREVIEW_GUTTER * 2);
  const left = parentRect ? parentRect.left + CHILD_POPUP_OFFSET : trigger.left;
  const top = trigger.bottom + ANCHOR_PREVIEW_OFFSET;
  return {
    x: clamp(left, ANCHOR_PREVIEW_GUTTER, viewport.right - maxWidth - ANCHOR_PREVIEW_GUTTER),
    y: clamp(top, ANCHOR_PREVIEW_GUTTER, viewport.bottom - ANCHOR_PREVIEW_GUTTER),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
