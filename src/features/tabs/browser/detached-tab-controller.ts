import { createContext } from "react";

/** タブを窓の外へドラッグして離したときの結果。 */
export type TabDropResult =
  /** 離した位置の既存の窓へ移した。 */
  | "moved"
  /** 離した位置に新しい窓を開いて移した。 */
  | "opened"
  /** 元の窓の中で離した、または移せない状態のため何もしなかった。 */
  | "ignored"
  /** 新しい窓を開けなかった。タブは元の位置に残る。 */
  | "failed";

export interface DetachedTabController {
  detachTab: (tabId: string) => boolean;
  /** 別窓だけを閉じ、タブを元ペインへ戻す。 */
  reattachTab: (tabId: string) => void;
  /** 別窓とタブを一緒に閉じる。 */
  closeDetachedTab: (tabId: string) => void;
  focusTabWindow: (tabId: string) => void;
  previewTabDrop: (
    tabId: string,
    screenX: number,
    screenY: number,
    originWindow: Window,
    clientPoint?: { x: number; y: number },
  ) => void;
  clearTabDropPreview: () => void;
  /**
   * ドラッグしたタブを画面上の位置 (screenX, screenY) で離したときの移動先を決めて移す。
   * 元の窓の中で離した場合は何もせず、タブバー内の並べ替えに任せる。
   */
  dropTabAtScreenPoint: (
    tabId: string,
    screenX: number,
    screenY: number,
    originWindow: Window,
    clientPoint?: { x: number; y: number },
  ) => TabDropResult;
}

export const defaultDetachedTabController: DetachedTabController = {
  detachTab: () => false,
  reattachTab: () => {},
  closeDetachedTab: () => {},
  focusTabWindow: () => {},
  previewTabDrop: () => {},
  clearTabDropPreview: () => {},
  dropTabAtScreenPoint: () => "ignored",
};

export const DetachedTabControllerContext = createContext<DetachedTabController>(
  defaultDetachedTabController,
);
