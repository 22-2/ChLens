import React, { useCallback, useEffect, useRef } from "react";
import type { IRes } from "src/service-container/interfaces";
import { AnchorPreview } from "src/view/browser/components/AnchorPreview";
import { PopupPortalLayer } from "src/view/browser/components/PopupPortalLayer";
import { ReplyTreePopup } from "src/view/browser/components/ReplyTreePopup";
import { ResPopup } from "src/view/browser/components/ResPopup";
import type {
  AnchorPopupItem,
  ContextMenuPopupItem,
  IdPopupItem,
  TreePopupItem,
} from "src/view/browser/hooks/popup-manager/types";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";

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
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onPopupAnchorHover: (
    popupId: string,
  ) => (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth?: number) => void;
  onClearAnchorPreviewHideTimer: () => void;
  onClosePopupById: (popupId: string) => void;
  onClosePopupChildren: (popupId: string) => void;
  onToggleTreePopupPinned: (popupId: string) => void;
  onToggleIdPopupPinned: (popupId: string) => void;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onPopupIdLinkClick: (parentId: string) => (id: string, e: React.MouseEvent) => void;
  onRepClickInPopup: (
    parentId?: string,
    anchorPreviewDepth?: number,
  ) => (resNum: number, e: React.MouseEvent) => void;
  onOpenRootReplyTreeInPopup: (
    parentId?: string,
    anchorPreviewDepth?: number,
  ) => (resNum: number, e: React.MouseEvent) => void;
  onResContextMenuOpen: (parentId: string) => (targetRes: IRes, e: React.MouseEvent) => void;
  onUrlClick: UrlClickHandler;
  onUrlContextMenuOpen: (parentId: string) => UrlContextMenuHandler;
  threadTitle?: string;
  threadUrl?: string;
  /** ポップアップ内でも画像ぼかしを適用するためのセット */
  blurredResNums?: Set<number>;
  ngResNums?: ReadonlySet<number>;
}

function useStablePopupHandlerCache(resetDeps: readonly unknown[]) {
  const cacheRef = useRef(new Map<string, unknown>());
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    cacheRef.current.clear();
  }, resetDeps);

  return useCallback(function getStablePopupHandler<Handler>(
    key: string,
    createHandler: () => Handler,
  ): Handler {
    const cachedHandler = cacheRef.current.get(key);
    if (cachedHandler !== undefined) {
      return cachedHandler as Handler;
    }

    const nextHandler = createHandler();
    cacheRef.current.set(key, nextHandler as unknown);
    return nextHandler;
  }, []);
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
  onToggleTreePopupPinned,
  onToggleIdPopupPinned,
  onIdLinkClick: _onIdLinkClick,
  onPopupIdLinkClick,
  onRepClickInPopup,
  onOpenRootReplyTreeInPopup,
  onResContextMenuOpen,
  onUrlClick,
  onUrlContextMenuOpen,
  threadTitle,
  threadUrl,
  blurredResNums,
  ngResNums,
}) => {
  const anchorPreviewDepthByIdRef = useRef(new Map<string, number>());
  anchorPreviewDepthByIdRef.current = new Map(
    anchorPreviews.map((anchorPreview) => [anchorPreview.id, anchorPreview.payload.depth]),
  );

  const getStablePopupHandler = useStablePopupHandlerCache([
    onAnchorLeave,
    onClosePopupById,
    onClosePopupChildren,
    onOpenRootReplyTreeInPopup,
    onPopupAnchorHover,
    onPopupIdLinkClick,
    onRepClickInPopup,
    onResContextMenuOpen,
    onToggleIdPopupPinned,
    onToggleTreePopupPinned,
    onUrlContextMenuOpen,
  ]);

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
          onUrlContextMenu={getStablePopupHandler(`url-context-menu:${anchorPreview.id}`, () =>
            onUrlContextMenuOpen(anchorPreview.id),
          )}
          onIdLinkClick={getStablePopupHandler(`id-link:${anchorPreview.id}`, () =>
            onPopupIdLinkClick(anchorPreview.id),
          )}
          onRepClick={getStablePopupHandler(
            `rep-click:${anchorPreview.id}:${anchorPreview.payload.depth + 1}`,
            () => onRepClickInPopup(anchorPreview.id, anchorPreview.payload.depth + 1),
          )}
          onOpenRootReplyTree={getStablePopupHandler(
            `root-tree:${anchorPreview.id}:${anchorPreview.payload.depth + 1}`,
            () => onOpenRootReplyTreeInPopup(anchorPreview.id, anchorPreview.payload.depth + 1),
          )}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
          onMouseEnter={onClearAnchorPreviewHideTimer}
          popupId={anchorPreview.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={getStablePopupHandler(
            `enter-from-descendant:${anchorPreview.id}`,
            () => () => onClosePopupChildren(anchorPreview.id),
          )}
          onMouseLeave={getStablePopupHandler(`mouse-leave:${anchorPreview.id}`, () => () => {
            const depth = anchorPreviewDepthByIdRef.current.get(anchorPreview.id) ?? 0;
            onAnchorLeave(depth);
          })}
          onPopupMouseDown={getStablePopupHandler(
            `popup-mouse-down:${anchorPreview.id}`,
            () => () => onClosePopupChildren(anchorPreview.id),
          )}
          onResContextMenu={getStablePopupHandler(`res-context-menu:${anchorPreview.id}`, () =>
            onResContextMenuOpen(anchorPreview.id),
          )}
          hasChildPopup={hasPopupChild(anchorPreview.id)}
          zIndex={anchorPreview.z}
          blurredResNums={blurredResNums}
          ngResNums={ngResNums}
          resMap={resMap}
          threadKey={threadUrl}
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
          onUrlContextMenu={getStablePopupHandler(`url-context-menu:${idPopup.id}`, () =>
            onUrlContextMenuOpen(idPopup.id),
          )}
          onIdLinkClick={getStablePopupHandler(`id-link:${idPopup.id}`, () =>
            onPopupIdLinkClick(idPopup.id),
          )}
          onRepClick={getStablePopupHandler(`rep-click:${idPopup.id}`, () =>
            onRepClickInPopup(idPopup.id),
          )}
          onAnchorClick={onAnchorClick}
          onAnchorHover={getStablePopupHandler(`anchor-hover:${idPopup.id}`, () =>
            onPopupAnchorHover(idPopup.id),
          )}
          onAnchorLeave={onAnchorLeave}
          popupId={idPopup.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={getStablePopupHandler(
            `enter-from-descendant:${idPopup.id}`,
            () => () => onClosePopupChildren(idPopup.id),
          )}
          onPopupMouseDown={getStablePopupHandler(
            `popup-mouse-down:${idPopup.id}`,
            () => () => onClosePopupChildren(idPopup.id),
          )}
          onResContextMenu={getStablePopupHandler(`res-context-menu:${idPopup.id}`, () =>
            onResContextMenuOpen(idPopup.id),
          )}
          disableOutsideClick={hasPopupChild(idPopup.id) || hasAnchorPreviews}
          pinned={idPopup.payload.pinned === true}
          onTogglePinned={getStablePopupHandler(
            `toggle-id-pin:${idPopup.id}`,
            () => () => onToggleIdPopupPinned(idPopup.id),
          )}
          zIndex={idPopup.z}
          onClose={getStablePopupHandler(
            `close:${idPopup.id}`,
            () => () => onClosePopupById(idPopup.id),
          )}
          onMouseEnter={onClearAnchorPreviewHideTimer}
          onMouseLeave={getStablePopupHandler(
            `mouse-leave:${idPopup.id}`,
            () => () => onAnchorLeave(0),
          )}
          blurredResNums={blurredResNums}
          ngResNums={ngResNums}
          resMap={resMap}
          threadKey={threadUrl}
          threadTitle={threadTitle}
          threadUrl={threadUrl}
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
          onUrlContextMenu={getStablePopupHandler(`url-context-menu:${treePopup.id}`, () =>
            onUrlContextMenuOpen(treePopup.id),
          )}
          onIdLinkClick={getStablePopupHandler(`id-link:${treePopup.id}`, () =>
            onPopupIdLinkClick(treePopup.id),
          )}
          onRepClick={getStablePopupHandler(
            `rep-click:${treePopup.id}:${treePopup.payload.anchorPreviewDepth}`,
            () => onRepClickInPopup(treePopup.id, treePopup.payload.anchorPreviewDepth),
          )}
          onAnchorClick={onAnchorClick}
          onAnchorHover={getStablePopupHandler(`anchor-hover:${treePopup.id}`, () =>
            onPopupAnchorHover(treePopup.id),
          )}
          onAnchorLeave={onAnchorLeave}
          popupId={treePopup.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={getStablePopupHandler(
            `enter-from-descendant:${treePopup.id}`,
            () => () => onClosePopupChildren(treePopup.id),
          )}
          onPopupMouseDown={getStablePopupHandler(
            `popup-mouse-down:${treePopup.id}`,
            () => () => onClosePopupChildren(treePopup.id),
          )}
          onResContextMenu={getStablePopupHandler(`res-context-menu:${treePopup.id}`, () =>
            onResContextMenuOpen(treePopup.id),
          )}
          disableOutsideClick={
            index < treePopupItems.length - 1 || hasAnchorPreviews || hasPopupChild(treePopup.id)
          }
          pinned={treePopup.payload.pinned === true}
          onTogglePinned={getStablePopupHandler(
            `toggle-pin:${treePopup.id}`,
            () => () => onToggleTreePopupPinned(treePopup.id),
          )}
          zIndex={treePopup.z}
          onClose={getStablePopupHandler(
            `close:${treePopup.id}`,
            () => () => onClosePopupById(treePopup.id),
          )}
          onMouseEnter={onClearAnchorPreviewHideTimer}
          onMouseLeave={getStablePopupHandler(
            `mouse-leave:${treePopup.id}`,
            () => () => onAnchorLeave(0),
          )}
          threadTitle={threadTitle}
          threadUrl={threadUrl}
          blurredResNums={blurredResNums}
          ngResNums={ngResNums}
          threadKey={threadUrl}
        />
      ))}

      {contextMenuItems.map((menu) => (
        <ContextMenu
          key={menu.id}
          x={menu.x}
          y={menu.y}
          items={menu.payload.items}
          onClose={getStablePopupHandler(`close:${menu.id}`, () => () => onClosePopupById(menu.id))}
          popupId={menu.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={getStablePopupHandler(
            `enter-from-descendant:${menu.id}`,
            () => () => onClosePopupChildren(menu.id),
          )}
          onPopupMouseDown={getStablePopupHandler(
            `popup-mouse-down:${menu.id}`,
            () => () => onClosePopupChildren(menu.id),
          )}
          closeDisabled={hasPopupChild(menu.id)}
          zIndex={menu.z}
        />
      ))}
    </PopupPortalLayer>
  );
};
