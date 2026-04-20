import { Copy, MoreVertical } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import type { IRes } from "src/service-container";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { PopupResCard } from "src/view/browser/components/PopupResCard";
import { ReplyTree } from "src/view/browser/components/ReplyTree";
import { usePopupSurfaceLifecycle } from "src/view/browser/hooks/use-popup-manager";
import type {
  UrlClickHandler,
  UrlContextMenuHandler,
} from "src/view/browser/utils/link-routing";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";
import { copyText, stripHtml } from "src/view/browser/utils/utils";

interface TreeMenuPosition {
  x: number;
  y: number;
}

function collectReplyTreeResponses(
  sourceResNum: number,
  repIndex: Map<number, Set<number>>,
  resMap: Map<number, IRes>,
): IRes[] {
  // 一括コピーでは「今見えている返信ツリー」をそのまま再現したいので、
  // 元レスから深さ優先で辿った順序をそのまま保持する。
  const visited = new Set<number>([sourceResNum]);
  const collected: IRes[] = [];

  const visit = (resNum: number) => {
    const replies = repIndex.get(resNum);
    if (!replies) {
      return;
    }

    const orderedReplyNums = Array.from(replies).sort(
      (left, right) => left - right,
    );
    for (const replyNum of orderedReplyNums) {
      if (visited.has(replyNum)) {
        continue;
      }

      const reply = resMap.get(replyNum);
      if (!reply) {
        continue;
      }

      visited.add(replyNum);
      collected.push(reply);
      visit(replyNum);
    }
  };

  visit(sourceResNum);
  return collected;
}

function formatResForCopy(res: IRes): string {
  const plainName = stripHtml(res.name);
  const plainMessage = stripHtml(res.message);
  return `${res.num} ${plainName}  ${res.date ?? res.other}\n${plainMessage}`;
}

function buildReplyTreeCopyText(
  sourceRes: IRes,
  replyResponses: IRes[],
): string {
  const sections = ["[参照元レス]", formatResForCopy(sourceRes)];
  if (replyResponses.length > 0) {
    sections.push(
      "",
      "[返信レス]",
      replyResponses.map(formatResForCopy).join("\n\n"),
    );
  }
  return sections.join("\n");
}

// --- 返信ツリーポップアップ ---
export const ReplyTreePopup: React.FC<{
  x: number;
  y: number;
  resNum: number;
  repIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
  messageProtocol: string;
  anchorPreviewDepth: number;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  /** 親子関係つきのメニュースタックをThreadPage側で一元管理する。 */
  onResContextMenu: (targetRes: IRes, event: React.MouseEvent) => void;
  onClose: () => void;
  /** アンカープレビューとの親子関係制御用 */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  /** 親popupをクリックした時に、その配下の枝だけ畳めるようにする。 */
  onSurfaceMouseDown?: () => void;
  /** 子ポップアップが開いている間は外側クリック閉じを無効にする */
  disableOutsideClick?: boolean;
  /** z-indexを明示指定（省略時はCSSのデフォルト値を使用） */
  zIndex?: number;
}> = ({
  x,
  y,
  resNum,
  repIndex,
  resMap,
  messageProtocol,
  anchorPreviewDepth,
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
  onSurfaceMouseDown,
  disableOutsideClick,
  zIndex,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    handleMouseEnter,
    handleMouseLeave,
  } = usePopupSurfaceLifecycle({
    surfaceRef: ref,
    popupId,
    isPopupDescendantOf,
    onEnterFromDescendant,
    closeDisabled: disableOutsideClick,
    onClose,
    onSurfaceMouseDown,
    onSurfaceMouseEnter: onMouseEnter,
    onSurfaceMouseLeave: onMouseLeave,
  });
  const [menuPosition, setMenuPosition] = useState<TreeMenuPosition | null>(
    null,
  );
  const sourceRes = resMap.get(resNum) ?? null;
  const replyResponses = sourceRes
    ? collectReplyTreeResponses(resNum, repIndex, resMap)
    : [];
  const treeMenuItems: ContextMenuItem[] = sourceRes
    ? [
        {
          id: "copy-tree-responses",
          label: "返信ツリーを一括コピー",
          icon: <Copy size={14} />,
          onSelect: () => {
            // 参照元レスも一緒に入れておくと、コピー先だけ見ても何への返信ツリーか判別できる。
            void copyText(buildReplyTreeCopyText(sourceRes, replyResponses));
          },
        },
      ]
    : [];

  // スクロールコンテナ内での position:absolute に対応したオーバーフロー補正
  useAdjustOverflow(ref);

  useEffect(() => {
    if (!menuPosition) {
      return;
    }

    const handleOutsideMenuClick = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) {
        setMenuPosition(null);
        return;
      }

      if (e.target.closest(".context-menu")) {
        return;
      }

      if (menuButtonRef.current?.contains(e.target)) {
        return;
      }

      setMenuPosition(null);
    };

    document.addEventListener("mousedown", handleOutsideMenuClick);
    return () =>
      document.removeEventListener("mousedown", handleOutsideMenuClick);
  }, [menuPosition]);

  const handleResContextMenu = (e: React.MouseEvent, targetRes: IRes) => {
    e.stopPropagation();
    onResContextMenu(targetRes, e);
  };

  const handleMenuClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!ref.current) {
      return;
    }

    const buttonRect = e.currentTarget.getBoundingClientRect();
    const popupRect = ref.current.getBoundingClientRect();
    setMenuPosition((prev) =>
      prev
        ? null
        : {
            x: buttonRect.right - popupRect.left - 8,
            y: buttonRect.bottom - popupRect.top + 4,
          },
    );
  };

  return (
    <div
      ref={ref}
      data-popup-surface="true"
      data-popup-id={popupId}
      className="res-popup"
      style={{ left: x, top: y, ...(zIndex != null && { zIndex }) }}
      onMouseDownCapture={handleMouseDownCapture}
      onAuxClickCapture={handleAuxClickCapture}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="res-popup__header">
        <span>{`>>${resNum} への返信ツリー`}</span>
        <div className="res-popup__header-actions">
          <button
            ref={menuButtonRef}
            className="res-popup__icon-btn"
            onClick={handleMenuClick}
            aria-label="返信ツリーメニュー"
            title="返信ツリーメニュー"
          >
            <MoreVertical size={14} />
          </button>
          <button className="res-popup__close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      <div className="res-popup__body">
        {sourceRes && (
          <section className="res-popup__section">
            <div className="res-popup__section-title">参照元レス</div>
            <PopupResCard
              res={sourceRes}
              messageProtocol={messageProtocol}
              anchorPreviewDepth={anchorPreviewDepth}
              repIndex={repIndex}
              isHighlighted={true}
              onUrlClick={onUrlClick}
              onUrlContextMenu={onUrlContextMenu}
              onLinkMiddleClickStart={armMouseLeaveCloseSuppression}
              onIdLinkClick={onIdLinkClick}
              onRepClick={onRepClick}
              onAnchorClick={onAnchorClick}
              onAnchorHover={onAnchorHover}
              onAnchorLeave={onAnchorLeave}
              onContextMenu={handleResContextMenu}
            />
          </section>
        )}
        <section className="res-popup__section">
          <div className="res-popup__section-title">返信レス</div>
          <ReplyTree
            resNum={resNum}
            repIndex={repIndex}
            resMap={resMap}
            messageProtocol={messageProtocol}
            anchorPreviewDepth={anchorPreviewDepth}
            onUrlClick={onUrlClick}
            onUrlContextMenu={onUrlContextMenu}
            onLinkMiddleClickStart={armMouseLeaveCloseSuppression}
            onIdLinkClick={onIdLinkClick}
            onRepClick={onRepClick}
            onAnchorClick={onAnchorClick}
            onAnchorHover={onAnchorHover}
            onAnchorLeave={onAnchorLeave}
            onResContextMenu={handleResContextMenu}
            visited={new Set()}
            depth={0}
          />
        </section>
      </div>
      {menuPosition && treeMenuItems.length > 0 && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          items={treeMenuItems}
          onClose={() => setMenuPosition(null)}
        />
      )}
    </div>
  );
};

export { buildReplyTreeCopyText, collectReplyTreeResponses };
