import React, { useCallback } from "react";
import { PopupResCardScope } from "src/features/popup/browser/popup-res-card-context";
import { RepeatedReplyProvider } from "src/features/popup/browser/repeated-reply-context";
import { usePopupHeaderMenu } from "src/features/popup/browser/use-popup-header-menu";
import { usePopupResContextMenu } from "src/features/popup/browser/use-popup-res-context-menu";
import { useResListPopupMenu } from "src/features/popup/browser/use-res-list-popup-menu";
import { PopupHeader } from "src/features/popup/ui/PopupHeader";
import { PopupResCard } from "src/features/popup/ui/PopupResCard";
import type { IRes } from "src/service-container";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { FloatingPopup } from "src/view/browser/ui/FloatingPopup";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";

export interface AnchorPreviewProps {
  depth: number;
  x: number;
  y: number;
  items: IRes[];
  label: string;
  messageProtocol: string;
  repIndex: Map<number, Set<number>>;
  idIndex?: Map<string, Set<number>>;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onOpenRootReplyTree: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  /** 親popup自体を触った時は、このpreview配下の枝だけ閉じ直せるようにする。 */
  onPopupMouseDown?: () => void;
  /** 子メニューも親子スタックへ載せ、参照プレビューの早閉じを防ぐ。 */
  onResContextMenu: (targetRes: IRes, event: React.MouseEvent) => void;
  hasChildPopup?: boolean;
  /** z-indexを明示指定（後から開いたポップアップが前面に出るよう呼び出し元が管理する） */
  zIndex: number;
  /** ポップアップ内でも画像ぼかしを適用するためのセット */
  blurredResNums?: Set<number>;
  ngResNums?: ReadonlySet<number>;
  ownResNums?: ReadonlySet<number>;
  replyToOwnResNums?: ReadonlySet<number>;
  resMap?: ReadonlyMap<number, unknown>;
  threadKey?: string;
  /** ピン留め中は明示的に閉じるまで自動クローズしない。 */
  pinned?: boolean;
  onTogglePinned?: () => void;
  /** ヘッダーの閉じるボタンや外側クリックで閉じる時の処理 */
  onClose?: () => void;
  /** 一括コピー末尾に付加するスレタイ */
  threadTitle?: string;
  /** 一括コピー末尾に付加するスレッドURL */
  threadUrl?: string;
}

export const AnchorPreview: React.FC<AnchorPreviewProps> = ({
  depth,
  x,
  y,
  items,
  label,
  messageProtocol,
  repIndex,
  idIndex,
  onUrlClick,
  onUrlContextMenu,
  onIdLinkClick,
  onRepClick,
  onOpenRootReplyTree,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onMouseEnter,
  onMouseLeave,
  popupId,
  isPopupDescendantOf,
  onEnterFromDescendant,
  onPopupMouseDown,
  onResContextMenu,
  hasChildPopup,
  zIndex,
  blurredResNums,
  ngResNums,
  ownResNums,
  replyToOwnResNums,
  resMap,
  threadKey,
  pinned = false,
  onTogglePinned,
  onClose,
  threadTitle,
  threadUrl,
}) => {
  const { menuButtonRef, menuPosition, handleMenuClick, closeMenu } = usePopupHeaderMenu();
  const title = `参照: ${label}`;
  const anchorMenuItems = useResListPopupMenu({
    variant: "anchor",
    items,
    title,
    threadTitle,
    threadUrl,
    pinned,
    onTogglePinned,
  });
  const handleResContextMenu = usePopupResContextMenu(onResContextMenu, onPopupMouseDown);

  const handleClose = useCallback(() => {
    // 変更理由: ピン留め時もヘッダーの閉じるボタンでは明示的に閉じられるようにし、
    // ホバー離脱による自動クローズだけを抑止する。非ピン時は従来どおり離脱時と同じ処理へ委譲する。
    if (onClose) {
      onClose();
      return;
    }
    onMouseLeave();
  }, [onClose, onMouseLeave]);

  return (
    <FloatingPopup
      className="anchor-preview"
      x={x}
      y={y}
      zIndex={zIndex}
      popupId={popupId}
      isPopupDescendantOf={isPopupDescendantOf}
      onEnterFromDescendant={onEnterFromDescendant}
      closeDisabled={hasChildPopup || pinned}
      closeOnOutsideClick={!pinned}
      onClose={onMouseLeave}
      onPopupMouseDown={onPopupMouseDown}
      onPopupMouseEnter={onMouseEnter}
      onMouseOver={onMouseEnter}
    >
      {({ armMouseLeaveCloseSuppression }) => (
        <>
          {/* 変更理由: IDポップアップや返信ツリーと共通のヘッダー操作にし、
              ピン留め・コピー・画像化を三点ドットメニューから利用できるようにする。 */}
          <PopupHeader
            title={title}
            menuButtonRef={menuButtonRef}
            menuLabel="アンカーポップアップメニュー"
            onMenuClick={handleMenuClick}
            pinned={pinned}
            onTogglePinned={onTogglePinned}
            onClose={handleClose}
          />
          <RepeatedReplyProvider responses={items.slice(0, 8)}>
            <PopupResCardScope
              messageProtocol={messageProtocol}
              idIndex={idIndex}
              resMap={resMap}
              threadKey={threadKey}
              blurredResNums={blurredResNums}
              ngResNums={ngResNums}
              ownResNums={ownResNums}
              replyToOwnResNums={replyToOwnResNums}
              onUrlClick={onUrlClick}
              onUrlContextMenu={onUrlContextMenu}
              onLinkMiddleClickStart={armMouseLeaveCloseSuppression}
              onIdLinkClick={onIdLinkClick}
              onRepClick={onRepClick}
              onAnchorClick={onAnchorClick}
              onAnchorHover={onAnchorHover}
              onAnchorLeave={onAnchorLeave}
              onContextMenu={handleResContextMenu}
            >
              <div className="anchor-preview__body">
                {items.slice(0, 8).map((res) => (
                  /* hard-ngでも空のアンカーポップアップにせず、利用者が明示操作で本文を確認できるようにする。 */
                  <PopupResCard
                    key={res.num}
                    res={res}
                    anchorPreviewDepth={depth + 1}
                    repIndex={repIndex}
                    onOpenRootReplyTree={onOpenRootReplyTree}
                    allowHardNgReveal
                  />
                ))}
              </div>
            </PopupResCardScope>
          </RepeatedReplyProvider>
          {menuPosition && items.length > 0 && (
            <ContextMenu
              x={menuPosition.x}
              y={menuPosition.y}
              items={anchorMenuItems}
              // 変更理由: ヘッダーメニューを所属popupとして扱い、メニュー操作で親子ごと閉じないようにする。
              popupId={popupId}
              // 変更理由: 三点ボタンもトグル操作のため、押下時の Radix 側の先行closeで
              // click トグルが開き直さないようトリガーとして登録する。
              triggerRef={menuButtonRef}
              onClose={closeMenu}
            />
          )}
        </>
      )}
    </FloatingPopup>
  );
};
AnchorPreview.displayName = "AnchorPreview";
