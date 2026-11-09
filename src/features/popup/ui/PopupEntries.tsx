import React, { useCallback, useMemo } from "react";
import type {
  AnchorPopupItem,
  IdPopupItem,
  TreePopupItem,
} from "src/features/popup/browser/popup-types";
import { AnchorPreview } from "src/features/popup/ui/AnchorPreview";
import { ReplyTreePopup } from "src/features/popup/ui/ReplyTreePopup";
import { ResPopup } from "src/features/popup/ui/ResPopup";
import type { IRes } from "src/service-container/interfaces";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";

/**
 * ポップアップ1件ぶんの描画に、種類を問わず共通で必要な値とハンドラー。
 *
 * 「ポップアップIDを束縛して返す」形のハンドラー（onRepClickInPopup など）は、
 * 呼ぶたびに新しい関数を返す。各エントリーが useMemo / useCallback で束縛し直すことで、
 * 親の関数かIDが変わった時だけ参照が変わるようにし、メモ化した子の無駄な再描画を防ぐ。
 * 以前は文字列キーの手書きキャッシュでこれを行っており、キーの付け間違いが起きやすかった。
 */
export interface PopupEntryContext {
  messageProtocol: string;
  repIndex: Map<number, Set<number>>;
  replySourceNums?: ReadonlySet<number>;
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
  onToggleAnchorPopupPinned: (popupId: string) => void;
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
  ownResNums?: ReadonlySet<number>;
  replyToOwnResNums?: ReadonlySet<number>;
}

/** 全種類のポップアップで同じ形になる、ID束縛済みのハンドラー群。 */
function useCommonPopupHandlers(popupId: string, context: PopupEntryContext) {
  const {
    onClosePopupById,
    onClosePopupChildren,
    onPopupIdLinkClick,
    onResContextMenuOpen,
    onUrlContextMenuOpen,
  } = context;
  const onUrlContextMenu = useMemo(
    () => onUrlContextMenuOpen(popupId),
    [onUrlContextMenuOpen, popupId],
  );
  const onIdLinkClick = useMemo(() => onPopupIdLinkClick(popupId), [onPopupIdLinkClick, popupId]);
  const onResContextMenu = useMemo(
    () => onResContextMenuOpen(popupId),
    [onResContextMenuOpen, popupId],
  );
  const onClose = useCallback(() => onClosePopupById(popupId), [onClosePopupById, popupId]);
  // 子孫のポップアップを畳む操作。親へ戻った時と、親を直接触った時の両方で使う。
  const onCloseChildren = useCallback(
    () => onClosePopupChildren(popupId),
    [onClosePopupChildren, popupId],
  );
  return { onUrlContextMenu, onIdLinkClick, onResContextMenu, onClose, onCloseChildren };
}

export const AnchorPreviewEntry: React.FC<{
  item: AnchorPopupItem;
  context: PopupEntryContext;
}> = ({ item, context }) => {
  const { id, payload } = item;
  const {
    onRepClickInPopup,
    onOpenRootReplyTreeInPopup,
    onToggleAnchorPopupPinned,
    onAnchorLeave,
  } = context;
  const common = useCommonPopupHandlers(id, context);
  // アンカープレビュー配下で開いたポップアップは、1つ深い階層として扱う。
  const childDepth = payload.depth + 1;
  const onRepClick = useMemo(
    () => onRepClickInPopup(id, childDepth),
    [onRepClickInPopup, id, childDepth],
  );
  const onOpenRootReplyTree = useMemo(
    () => onOpenRootReplyTreeInPopup(id, childDepth),
    [onOpenRootReplyTreeInPopup, id, childDepth],
  );
  const onTogglePinned = useCallback(
    () => onToggleAnchorPopupPinned(id),
    [onToggleAnchorPopupPinned, id],
  );
  const onMouseLeave = useCallback(
    () => onAnchorLeave(payload.depth),
    [onAnchorLeave, payload.depth],
  );

  return (
    <AnchorPreview
      depth={payload.depth}
      x={item.x}
      y={item.y}
      items={payload.items}
      label={payload.label}
      messageProtocol={context.messageProtocol}
      repIndex={context.repIndex}
      idIndex={context.idIndex}
      onUrlClick={context.onUrlClick}
      onUrlContextMenu={common.onUrlContextMenu}
      onIdLinkClick={common.onIdLinkClick}
      onRepClick={onRepClick}
      onOpenRootReplyTree={onOpenRootReplyTree}
      onAnchorClick={context.onAnchorClick}
      onAnchorHover={context.onAnchorHover}
      onAnchorLeave={onAnchorLeave}
      onMouseEnter={context.onClearAnchorPreviewHideTimer}
      popupId={id}
      isPopupDescendantOf={context.isPopupDescendantOf}
      onEnterFromDescendant={common.onCloseChildren}
      onMouseLeave={onMouseLeave}
      onPopupMouseDown={common.onCloseChildren}
      onResContextMenu={common.onResContextMenu}
      hasChildPopup={context.hasPopupChild(id)}
      zIndex={item.z}
      blurredResNums={context.blurredResNums}
      ngResNums={context.ngResNums}
      ownResNums={context.ownResNums}
      replyToOwnResNums={context.replyToOwnResNums}
      resMap={context.resMap}
      threadKey={context.threadUrl}
      pinned={payload.pinned === true}
      onTogglePinned={onTogglePinned}
      onClose={common.onClose}
      threadTitle={context.threadTitle}
      threadUrl={context.threadUrl}
    />
  );
};

export const IdPopupEntry: React.FC<{
  item: IdPopupItem;
  context: PopupEntryContext;
}> = ({ item, context }) => {
  const { id, payload } = item;
  const {
    onRepClickInPopup,
    onOpenRootReplyTreeInPopup,
    onPopupAnchorHover,
    onToggleIdPopupPinned,
    onAnchorLeave,
  } = context;
  const common = useCommonPopupHandlers(id, context);
  const onRepClick = useMemo(() => onRepClickInPopup(id), [onRepClickInPopup, id]);
  const onOpenRootReplyTree = useMemo(
    () => onOpenRootReplyTreeInPopup(id),
    [onOpenRootReplyTreeInPopup, id],
  );
  const onAnchorHover = useMemo(() => onPopupAnchorHover(id), [onPopupAnchorHover, id]);
  const onTogglePinned = useCallback(() => onToggleIdPopupPinned(id), [onToggleIdPopupPinned, id]);
  const onMouseLeave = useCallback(() => onAnchorLeave(0), [onAnchorLeave]);

  return (
    <ResPopup
      x={item.x}
      y={item.y}
      title={payload.title}
      items={payload.items}
      messageProtocol={context.messageProtocol}
      repIndex={context.repIndex}
      idIndex={context.idIndex}
      onUrlClick={context.onUrlClick}
      onUrlContextMenu={common.onUrlContextMenu}
      onIdLinkClick={common.onIdLinkClick}
      onRepClick={onRepClick}
      onOpenRootReplyTree={onOpenRootReplyTree}
      onAnchorClick={context.onAnchorClick}
      onAnchorHover={onAnchorHover}
      onAnchorLeave={onAnchorLeave}
      popupId={id}
      isPopupDescendantOf={context.isPopupDescendantOf}
      onEnterFromDescendant={common.onCloseChildren}
      onPopupMouseDown={common.onCloseChildren}
      onResContextMenu={common.onResContextMenu}
      disableOutsideClick={context.hasPopupChild(id) || context.hasAnchorPreviews}
      pinned={payload.pinned === true}
      onTogglePinned={onTogglePinned}
      zIndex={item.z}
      onClose={common.onClose}
      onMouseEnter={context.onClearAnchorPreviewHideTimer}
      onMouseLeave={onMouseLeave}
      blurredResNums={context.blurredResNums}
      ngResNums={context.ngResNums}
      ownResNums={context.ownResNums}
      replyToOwnResNums={context.replyToOwnResNums}
      resMap={context.resMap}
      threadKey={context.threadUrl}
      threadTitle={context.threadTitle}
      threadUrl={context.threadUrl}
    />
  );
};

export const TreePopupEntry: React.FC<{
  item: TreePopupItem;
  /** 後から開いた返信ツリーが残っている間は、先に開いたものを外側クリックで閉じない。 */
  hasLaterTreePopup: boolean;
  context: PopupEntryContext;
}> = ({ item, hasLaterTreePopup, context }) => {
  const { id, payload } = item;
  const {
    onRepClickInPopup,
    onOpenRootReplyTreeInPopup,
    onPopupAnchorHover,
    onToggleTreePopupPinned,
    onAnchorLeave,
  } = context;
  const common = useCommonPopupHandlers(id, context);
  const onRepClick = useMemo(
    () => onRepClickInPopup(id, payload.anchorPreviewDepth),
    [onRepClickInPopup, id, payload.anchorPreviewDepth],
  );
  const onOpenRootReplyTree = useMemo(
    () => onOpenRootReplyTreeInPopup(id, payload.anchorPreviewDepth),
    [onOpenRootReplyTreeInPopup, id, payload.anchorPreviewDepth],
  );
  const onAnchorHover = useMemo(() => onPopupAnchorHover(id), [onPopupAnchorHover, id]);
  const onTogglePinned = useCallback(
    () => onToggleTreePopupPinned(id),
    [onToggleTreePopupPinned, id],
  );
  const onMouseLeave = useCallback(() => onAnchorLeave(0), [onAnchorLeave]);

  return (
    <ReplyTreePopup
      x={item.x}
      y={item.y}
      resNum={payload.resNum}
      focusResNum={payload.focusResNum}
      repIndex={context.repIndex}
      replySourceNums={context.replySourceNums}
      idIndex={context.idIndex}
      resMap={context.resMap}
      messageProtocol={context.messageProtocol}
      anchorPreviewDepth={payload.anchorPreviewDepth}
      onUrlClick={context.onUrlClick}
      onUrlContextMenu={common.onUrlContextMenu}
      onIdLinkClick={common.onIdLinkClick}
      onRepClick={onRepClick}
      onOpenRootReplyTree={onOpenRootReplyTree}
      onAnchorClick={context.onAnchorClick}
      onAnchorHover={onAnchorHover}
      onAnchorLeave={onAnchorLeave}
      popupId={id}
      isPopupDescendantOf={context.isPopupDescendantOf}
      onEnterFromDescendant={common.onCloseChildren}
      onPopupMouseDown={common.onCloseChildren}
      onResContextMenu={common.onResContextMenu}
      disableOutsideClick={
        hasLaterTreePopup || context.hasAnchorPreviews || context.hasPopupChild(id)
      }
      pinned={payload.pinned === true}
      onTogglePinned={onTogglePinned}
      zIndex={item.z}
      onClose={common.onClose}
      onMouseEnter={context.onClearAnchorPreviewHideTimer}
      onMouseLeave={onMouseLeave}
      threadTitle={context.threadTitle}
      threadUrl={context.threadUrl}
      blurredResNums={context.blurredResNums}
      ngResNums={context.ngResNums}
      ownResNums={context.ownResNums}
      replyToOwnResNums={context.replyToOwnResNums}
      threadKey={context.threadUrl}
    />
  );
};
