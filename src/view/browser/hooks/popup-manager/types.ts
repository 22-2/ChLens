import type { IRes } from "src/service-container";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";

// popup managerのライフサイクルと描画側が共有する判別unionなので、
// 汎用utilsではなくpopup managerの所有型としてここに置く。
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
    /** ピン留め中は本文操作やマウス離脱で自動的に閉じない。 */
    pinned?: boolean;
  };
}

export interface TreePopupItem extends PopupItemBase {
  type: "tree";
  payload: {
    resNum: number;
    /** ピン留め中は本文操作やマウス離脱で自動的に閉じない。 */
    pinned?: boolean;
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
