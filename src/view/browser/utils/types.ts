import type { IRes } from "src/service-container";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";

export type ThreadFilter = "all" | "popular" | "image" | "video" | "link";
export interface Props {
  tabId: string;
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
    // 返信ツリー内で開いたアンカーも親アンカープレビュー配下として扱い続けないと、
    // 次のアンカーホバーで既存プレビュー一式を root 扱いで閉じてしまう。
    anchorPreviewDepth: number;
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
  payload: ContextMenuPopupPayload;
}

export interface ContextMenuPopupPayload {
  // メニュー項目自体をスタックへ積むことで、
  // 親ポップアップと同じ parentId ツリーで開閉を同期できる。
  items: ContextMenuItem[];
}

export type PopupItem = IdPopupItem | TreePopupItem | AnchorPopupItem | ContextMenuPopupItem;

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
  anchorPreviewDepth: number;
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
