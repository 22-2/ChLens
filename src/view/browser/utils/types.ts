import type { IRes } from "src/service-container";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";

export type ThreadFilter = "all" | "popular" | "image" | "video" | "link";
export interface Props {
  page: ThreadPageType;
  refreshKey: number;
}
// --- ポップアップ状態 ---
export interface PopupState {
  x: number;
  y: number;
  items: IRes[];
  title: string;
  /** 開いた順に割り当てられるz-index。後から開いたものが常に前面になる。 */
  z: number;
}
export interface TreePopupState {
  x: number;
  y: number;
  resNum: number;
  /** 開いた順に割り当てられるz-index。後から開いたものが常に前面になる。 */
  z: number;
}
export interface ResContextMenuState {
  x: number;
  y: number;
  res: IRes;
}
export interface ViewerState {
  src: string;
  label: string;
  /** 同じレス内の画像URL一覧（前後移動に使用） */
  images?: string[];
  currentIndex?: number;
}
export interface AnchorPreviewState {
  depth: number;
  x: number;
  y: number;
  items: IRes[];
  label: string;
  /** 開いた順に割り当てられるz-index。後から開いたものが常に前面になる。 */
  z: number;
}
