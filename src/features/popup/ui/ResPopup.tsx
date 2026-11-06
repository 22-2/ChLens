import { useVirtualizer } from "@tanstack/react-virtual";
import React, { useMemo, useRef } from "react";
import { PopupResCardScope } from "src/features/popup/browser/popup-res-card-context";
import { RepeatedReplyProvider } from "src/features/popup/browser/repeated-reply-context";
import { usePopupHeaderMenu } from "src/features/popup/browser/use-popup-header-menu";
import { usePopupResContextMenu } from "src/features/popup/browser/use-popup-res-context-menu";
import { usePopupResponseVisibility } from "src/features/popup/browser/use-popup-visible-responses";
import { useResListPopupMenu } from "src/features/popup/browser/use-res-list-popup-menu";
import { PopupHeader } from "src/features/popup/ui/PopupHeader";
import { PopupResCard } from "src/features/popup/ui/PopupResCard";
import type { IRes } from "src/service-container";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { FloatingPopup } from "src/view/browser/ui/FloatingPopup";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";

function PopupResponseList({
  items,
  repIndex,
}: {
  items: IRes[];
  repIndex: Map<number, Set<number>>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 少数のレスはそのまま描画し、大量のIDレスだけ表示範囲に絞ってDOMと画像処理を抑える。
  const virtualized = items.length > 50;
  const virtualizer = useVirtualizer({
    count: virtualized ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    getItemKey: (index) => items[index].num,
    overscan: 5,
    initialRect: { width: 520, height: 500 },
  });
  const card = (res: IRes) => <PopupResCard res={res} anchorPreviewDepth={0} repIndex={repIndex} />;

  return (
    <div className="res-popup__body" ref={scrollRef}>
      {virtualized ? (
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${item.start}px)`,
              }}
            >
              {card(items[item.index])}
            </div>
          ))}
        </div>
      ) : (
        items.map((res) => <React.Fragment key={res.num}>{card(res)}</React.Fragment>)
      )}
    </div>
  );
}

// --- IDポップアップ ---
export const ResPopup: React.FC<{
  x: number;
  y: number;
  title: string;
  items: IRes[];
  messageProtocol: string;
  repIndex: Map<number, Set<number>>;
  idIndex?: Map<string, Set<number>>;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  /**
   * メニューを親ポップアップと同じスタックで管理し、
   * 子メニューのクリックで親が閉じないよう中央管理へ委譲する。
   */
  onResContextMenu: (targetRes: IRes, event: React.MouseEvent) => void;
  onClose: () => void;
  /** アンカープレビューとの親子関係制御用 */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  /** 親popupをクリックした時に、その配下の枝だけ畳めるようにする。 */
  onPopupMouseDown?: () => void;
  /** 子ポップアップが開いている間は外側クリック閉じを無効にする */
  disableOutsideClick?: boolean;
  /** ピン留め中は明示的に閉じるまで自動クローズしない。 */
  pinned?: boolean;
  onTogglePinned?: () => void;
  /** z-indexを明示指定（省略時はCSSのデフォルト値を使用） */
  zIndex?: number;
  /** 画像コピー末尾に付加するスレタイ */
  threadTitle?: string;
  /** 画像コピー末尾に付加するスレッドURL */
  threadUrl?: string;
  /** ポップアップ内でも画像ぼかしを適用するためのセット */
  blurredResNums?: Set<number>;
  ngResNums?: ReadonlySet<number>;
  ownResNums?: ReadonlySet<number>;
  replyToOwnResNums?: ReadonlySet<number>;
  resMap?: ReadonlyMap<number, unknown>;
  threadKey?: string;
}> = ({
  x,
  y,
  title,
  items,
  messageProtocol,
  repIndex,
  idIndex,
  onUrlClick,
  onUrlContextMenu,
  onIdLinkClick,
  onRepClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onResContextMenu,
  onClose,
  onMouseEnter,
  onMouseLeave,
  popupId,
  isPopupDescendantOf,
  onEnterFromDescendant,
  onPopupMouseDown,
  disableOutsideClick,
  pinned = false,
  onTogglePinned,
  zIndex,
  threadTitle,
  threadUrl,
  blurredResNums,
  ngResNums,
  ownResNums,
  replyToOwnResNums,
  resMap,
  threadKey,
}) => {
  const isVisible = usePopupResponseVisibility();
  const visibleItems = useMemo(() => items.filter(isVisible), [items, isVisible]);
  const { menuButtonRef, menuPosition, handleMenuClick, closeMenu } = usePopupHeaderMenu();
  const idMenuItems = useResListPopupMenu({
    variant: "id",
    items: visibleItems,
    title,
    threadTitle,
    threadUrl,
    pinned,
    onTogglePinned,
  });
  const handleResContextMenu = usePopupResContextMenu(onResContextMenu, onPopupMouseDown);
  return (
    <FloatingPopup
      className="res-popup"
      x={x}
      y={y}
      zIndex={zIndex}
      popupId={popupId}
      isPopupDescendantOf={isPopupDescendantOf}
      onEnterFromDescendant={onEnterFromDescendant}
      closeDisabled={disableOutsideClick || pinned}
      closeOnOutsideClick={!pinned}
      onClose={onClose}
      onPopupMouseDown={onPopupMouseDown}
      onPopupMouseEnter={onMouseEnter}
      onPopupMouseLeave={onMouseLeave}
      // ポップアップ内のレス間マウス移動で ResBody の handleMouseLeave が起動した
      // アンカープレビュー hide タイマーをキャンセルする。mouseover はバブルするため、
      // 子孫要素への移動時も発火し、mouseenter と異なりポップアップ外からの進入に限定されない。
      onMouseOver={onMouseEnter}
    >
      {({ armMouseLeaveCloseSuppression }) => (
        <>
          <PopupHeader
            title={title}
            menuButtonRef={menuButtonRef}
            menuLabel="IDポップアップメニュー"
            onMenuClick={handleMenuClick}
            pinned={pinned}
            onTogglePinned={onTogglePinned}
            onClose={onClose}
          />
          <RepeatedReplyProvider responses={visibleItems}>
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
              <PopupResponseList items={visibleItems} repIndex={repIndex} />
            </PopupResCardScope>
          </RepeatedReplyProvider>
          {menuPosition && visibleItems.length > 0 && (
            <ContextMenu
              x={menuPosition.x}
              y={menuPosition.y}
              items={idMenuItems}
              // ヘッダーメニューを所属popupとして扱い、メニュー操作で親のIDポップアップを閉じない。
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
