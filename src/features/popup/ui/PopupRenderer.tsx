import React from "react";
import type {
  AnchorPopupItem,
  ContextMenuPopupItem,
  IdPopupItem,
  TreePopupItem,
} from "src/features/popup/browser/popup-types";
import type { PopupEntryContext } from "src/features/popup/ui/PopupEntries";
import {
  AnchorPreviewEntry,
  IdPopupEntry,
  TreePopupEntry,
} from "src/features/popup/ui/PopupEntries";
import { PopupPortalLayer } from "src/features/popup/ui/PopupPortalLayer";
import {
  ResMenuTargetHeader,
  ResMenuTargetMarker,
} from "src/view/browser/components/ResContextMenuTarget";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";

interface PopupRendererProps extends PopupEntryContext {
  host: HTMLDivElement | null;
  anchorPreviews: AnchorPopupItem[];
  idPopupItems: IdPopupItem[];
  treePopupItems: TreePopupItem[];
  contextMenuItems: ContextMenuPopupItem[];
  // 変更理由: レス本体・IDポップアップ・返信ツリーから開くメニューでも、
  // 同じナビゲーション操作をメニュー上段へ表示できるよう、メニュー単位で見出しを生成する。
  contextMenuHeader?: (menu: ContextMenuPopupItem) => React.ReactNode;
}

export const PopupRenderer: React.FC<PopupRendererProps> = ({
  host,
  anchorPreviews,
  idPopupItems,
  treePopupItems,
  contextMenuItems,
  contextMenuHeader,
  ...context
}) => {
  const { hasPopupChild, isPopupDescendantOf, onClosePopupById, onClosePopupChildren } = context;

  return (
    <PopupPortalLayer host={host}>
      {anchorPreviews.map((anchorPreview) => (
        <AnchorPreviewEntry key={anchorPreview.id} item={anchorPreview} context={context} />
      ))}

      {idPopupItems.map((idPopup) => (
        <IdPopupEntry key={idPopup.id} item={idPopup} context={context} />
      ))}

      {treePopupItems.map((treePopup, index) => (
        <TreePopupEntry
          key={treePopup.id}
          item={treePopup}
          hasLaterTreePopup={index < treePopupItems.length - 1}
          context={context}
        />
      ))}

      {contextMenuItems.map((menu) => {
        const { target } = menu.payload;
        const navigationHeader = contextMenuHeader?.(menu);
        return (
          <React.Fragment key={menu.id}>
            {target ? <ResMenuTargetMarker element={target.element} /> : null}
            <ContextMenu
              x={menu.x}
              y={menu.y}
              items={menu.payload.items}
              header={
                target || navigationHeader ? (
                  <>
                    {target ? <ResMenuTargetHeader resNum={target.resNum} /> : null}
                    {navigationHeader}
                  </>
                ) : undefined
              }
              onClose={() => onClosePopupById(menu.id)}
              popupId={menu.id}
              isPopupDescendantOf={isPopupDescendantOf}
              onEnterFromDescendant={() => onClosePopupChildren(menu.id)}
              onPopupMouseDown={() => onClosePopupChildren(menu.id)}
              closeDisabled={hasPopupChild(menu.id)}
              zIndex={menu.z}
            />
          </React.Fragment>
        );
      })}
    </PopupPortalLayer>
  );
};
