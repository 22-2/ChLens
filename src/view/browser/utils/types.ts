import type { IRes } from "src/service-container";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";

export type ThreadFilter = "all" | "popular" | "image" | "video" | "link";
export interface Props {
  page: ThreadPageType;
  refreshKey: number;
}

export type PopupItemType = "id" | "tree" | "anchor" | "contextMenu";

export interface PopupItemBase {
  id: string;
  type: PopupItemType;
  x: number;
  y: number;
  z: number;
  parentId?: string;
}

export interface IdPopupItem extends PopupItemBase {
  type: "id";
  payload: {
    items: IRes[];
    title: string;
  };
}

export interface TreePopupItem extends PopupItemBase {
  type: "tree";
  payload: {
    resNum: number;
  };
}

export interface AnchorPopupItem extends PopupItemBase {
  type: "anchor";
  payload: {
    items: IRes[];
    label: string;
    depth: number;
  };
}

export interface ContextMenuPopupItem extends PopupItemBase {
  type: "contextMenu";
  payload: {
    res: IRes;
    fromPopup: boolean;
  };
}

export type PopupItem =
  | IdPopupItem
  | TreePopupItem
  | AnchorPopupItem
  | ContextMenuPopupItem;

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
