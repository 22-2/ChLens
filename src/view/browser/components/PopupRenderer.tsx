import React from "react";
import type { IRes } from "src/service-container/interfaces";
import { AnchorPreview } from "src/view/browser/components/AnchorPreview";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { PopupPortalLayer } from "src/view/browser/components/PopupPortalLayer";
import { ReplyTreePopup } from "src/view/browser/components/ReplyTreePopup";
import { ResPopup } from "src/view/browser/components/ResPopup";
import type {
  UrlClickHandler,
  UrlContextMenuHandler,
} from "src/view/browser/utils/link-routing";
import type {
  AnchorPopupItem,
  ContextMenuPopupItem,
  IdPopupItem,
  TreePopupItem,
} from "src/view/browser/utils/types";

interface PopupRendererProps {
  host: HTMLDivElement | null;
  anchorPreviews: AnchorPopupItem[];
  idPopupItems: IdPopupItem[];
  treePopupItems: TreePopupItem[];
  contextMenuItems: ContextMenuPopupItem[];
  messageProtocol: string;
  repIndex: Map<number, Set<number>>;
  idIndex: Map<string, Set<number>>;
  resMap: Map<number, IRes>;
  hasAnchorPreviews: boolean;
  hasPopupChild: (popupId: string) => boolean;
  isPopupDescendantOf: (popupId: string, ancestorId: string) => boolean;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => void;
  onPopupAnchorHover: (
    popupId: string,
  ) => (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => void;
  onAnchorLeave: (fromDepth?: number) => void;
  onClearAnchorPreviewHideTimer: () => void;
  onClosePopupById: (popupId: string) => void;
  onClosePopupChildren: (popupId: string) => void;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onPopupIdLinkClick: (
    parentId: string,
  ) => (id: string, e: React.MouseEvent) => void;
  onRepClickInPopup: (
    parentId?: string,
    anchorPreviewDepth?: number,
  ) => (resNum: number, e: React.MouseEvent) => void;
  onResContextMenuOpen: (
    parentId: string,
  ) => (targetRes: IRes, e: React.MouseEvent) => void;
  onUrlClick: UrlClickHandler;
  onUrlContextMenuOpen: (
    parentId: string,
  ) => UrlContextMenuHandler;
}

export const PopupRenderer: React.FC<PopupRendererProps> = ({
  host,
  anchorPreviews,
  idPopupItems,
  treePopupItems,
  contextMenuItems,
  messageProtocol,
  repIndex,
  idIndex,
  resMap,
  hasAnchorPreviews,
  hasPopupChild,
  isPopupDescendantOf,
  onAnchorClick,
  onAnchorHover,
  onPopupAnchorHover,
  onAnchorLeave,
  onClearAnchorPreviewHideTimer,
  onClosePopupById,
  onClosePopupChildren,
  onIdLinkClick,
  onPopupIdLinkClick,
  onRepClickInPopup,
  onResContextMenuOpen,
  onUrlClick,
  onUrlContextMenuOpen,
}) => {
  return (
    <PopupPortalLayer host={host}>
      {anchorPreviews.map((anchorPreview) => (
        <AnchorPreview
          key={anchorPreview.id}
          depth={anchorPreview.payload.depth}
          x={anchorPreview.x}
          y={anchorPreview.y}
          items={anchorPreview.payload.items}
          label={anchorPreview.payload.label}
          messageProtocol={messageProtocol}
          repIndex={repIndex}
          idIndex={idIndex}
          onUrlClick={onUrlClick}
          onUrlContextMenu={onUrlContextMenuOpen(anchorPreview.id)}
          onIdLinkClick={onPopupIdLinkClick(anchorPreview.id)}
          onRepClick={onRepClickInPopup(
            anchorPreview.id,
            anchorPreview.payload.depth + 1,
          )}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
          onMouseEnter={onClearAnchorPreviewHideTimer}
          popupId={anchorPreview.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={() => onClosePopupChildren(anchorPreview.id)}
          onMouseLeave={() => onAnchorLeave(anchorPreview.payload.depth)}
          onSurfaceMouseDown={() => onClosePopupChildren(anchorPreview.id)}
          onResContextMenu={onResContextMenuOpen(anchorPreview.id)}
          hasChildPopup={hasPopupChild(anchorPreview.id)}
          zIndex={anchorPreview.z}
        />
      ))}

      {idPopupItems.map((idPopup) => (
        <ResPopup
          key={idPopup.id}
          x={idPopup.x}
          y={idPopup.y}
          title={idPopup.payload.title}
          items={idPopup.payload.items}
          messageProtocol={messageProtocol}
          repIndex={repIndex}
          idIndex={idIndex}
          onUrlClick={onUrlClick}
          onUrlContextMenu={onUrlContextMenuOpen(idPopup.id)}
          onIdLinkClick={onPopupIdLinkClick(idPopup.id)}
          onRepClick={onRepClickInPopup(idPopup.id)}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onPopupAnchorHover(idPopup.id)}
          onAnchorLeave={onAnchorLeave}
          popupId={idPopup.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={() => onClosePopupChildren(idPopup.id)}
          onSurfaceMouseDown={() => onClosePopupChildren(idPopup.id)}
          onResContextMenu={onResContextMenuOpen(idPopup.id)}
          disableOutsideClick={hasPopupChild(idPopup.id) || hasAnchorPreviews}
          zIndex={idPopup.z}
          onClose={() => onClosePopupById(idPopup.id)}
          onMouseEnter={onClearAnchorPreviewHideTimer}
          onMouseLeave={() => onAnchorLeave(0)}
        />
      ))}

      {treePopupItems.map((treePopup, index) => (
        <ReplyTreePopup
          key={treePopup.id}
          x={treePopup.x}
          y={treePopup.y}
          resNum={treePopup.payload.resNum}
          repIndex={repIndex}
          idIndex={idIndex}
          resMap={resMap}
          messageProtocol={messageProtocol}
          anchorPreviewDepth={treePopup.payload.anchorPreviewDepth}
          onUrlClick={onUrlClick}
          onUrlContextMenu={onUrlContextMenuOpen(treePopup.id)}
          onIdLinkClick={onPopupIdLinkClick(treePopup.id)}
          onRepClick={onRepClickInPopup(
            treePopup.id,
            treePopup.payload.anchorPreviewDepth,
          )}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onPopupAnchorHover(treePopup.id)}
          onAnchorLeave={onAnchorLeave}
          popupId={treePopup.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={() => onClosePopupChildren(treePopup.id)}
          onSurfaceMouseDown={() => onClosePopupChildren(treePopup.id)}
          onResContextMenu={onResContextMenuOpen(treePopup.id)}
          disableOutsideClick={
            index < treePopupItems.length - 1 ||
            hasAnchorPreviews ||
            hasPopupChild(treePopup.id)
          }
          zIndex={treePopup.z}
          onClose={() => onClosePopupById(treePopup.id)}
          onMouseEnter={onClearAnchorPreviewHideTimer}
          onMouseLeave={() => onAnchorLeave(0)}
        />
      ))}

      {contextMenuItems.map((menu) => (
        <ContextMenu
          key={menu.id}
          x={menu.x}
          y={menu.y}
          items={menu.payload.items}
          onClose={() => onClosePopupById(menu.id)}
          popupId={menu.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={() => onClosePopupChildren(menu.id)}
          onSurfaceMouseDown={() => onClosePopupChildren(menu.id)}
          closeDisabled={hasPopupChild(menu.id)}
          zIndex={menu.z}
        />
      ))}
    </PopupPortalLayer>
  );
};
