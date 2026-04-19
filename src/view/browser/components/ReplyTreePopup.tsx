import { Copy, MoreVertical } from "lucide-react";
import React from "react";
import { useEffect, useRef, useState } from "react";
import type { IRes } from "src/service-container";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import { ReplyTree } from "src/view/browser/components/ReplyTree";
import { POPUP_SURFACE_SELECTOR } from "src/view/browser/utils/constants";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";
import { copyText, stripHtml } from "src/view/browser/utils/utils";
import { PopupResCard } from "src/view/browser/components/PopupResCard";

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

    const orderedReplyNums = Array.from(replies).sort((left, right) => left - right);
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

function buildReplyTreeCopyText(sourceRes: IRes, replyResponses: IRes[]): string {
  const sections = ["[参照元レス]", formatResForCopy(sourceRes)];
  if (replyResponses.length > 0) {
    sections.push("", "[返信レス]", replyResponses.map(formatResForCopy).join("\n\n"));
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
  onUrlClick: (url: string, resImages?: string[], button?: 0 | 1) => void;
  onUrlContextMenu: (url: string, e: React.MouseEvent) => void;
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
  onRepClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onResContextMenu,
  onClose,
  onMouseEnter,
  onMouseLeave,
  onSurfaceMouseDown,
  disableOutsideClick,
  zIndex,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<TreeMenuPosition | null>(null);
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

  // カーソルがポップアップ内にあるかを追跡する。
  // disableOutsideClick が true→false に変わる瞬間にカーソルが外にある場合、
  // mouseleave は既に無視済みのためこのフラグで自動 close を補完する。
  const [isHovering, setIsHovering] = useState(false);

  // onClose の参照を ref で保持し、古い参照を useEffect に取り込まないようにする
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 子ポップアップが閉じて disableOutsideClick が true→false に変わった瞬間、
  // カーソルがポップアップ外にある場合は自動的に閉じる。
  // （mouseleave は disableOutsideClick=true の間に既に発火・無視済みのため、ここで補完する）
  const prevDisableRef = useRef(!!disableOutsideClick);
  useEffect(() => {
    const wasDisabled = prevDisableRef.current;
    prevDisableRef.current = !!disableOutsideClick;
    if (wasDisabled && !disableOutsideClick && !isHovering) {
      onCloseRef.current();
    }
  }, [disableOutsideClick, isHovering]);

  // 子がいない状態（disableOutsideClick=false）では外側クリックでも閉じる
  useEffect(() => {
    if (disableOutsideClick) return;
    const handler = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(POPUP_SURFACE_SELECTOR)) {
        return;
      }
      if (ref.current) {
        onCloseRef.current();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [disableOutsideClick]);

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
    return () => document.removeEventListener("mousedown", handleOutsideMenuClick);
  }, [menuPosition]);

  const handleMouseLeave = () => {
    // 子ポップアップや子メニューが開いている間は親を閉じない。
    if (disableOutsideClick) return;
    onClose();
  };

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
      className="res-popup"
      style={{ left: x, top: y, ...(zIndex != null && { zIndex }) }}
      onMouseDownCapture={() => {
        onSurfaceMouseDown?.();
      }}
      onMouseEnter={() => {
        setIsHovering(true);
        onMouseEnter?.();
      }}
      onMouseLeave={(e) => {
        if (e.relatedTarget instanceof Node && ref.current?.contains(e.relatedTarget)) {
          return;
        }
        if (
          e.relatedTarget instanceof Element &&
          e.relatedTarget.closest(POPUP_SURFACE_SELECTOR)
        ) {
          return;
        }
        // popup surface間の移動では親子チェーンを維持したいので、
        // 実際にsurface外へ出た時だけleave callbackを流す。
        onMouseLeave?.();
        setIsHovering(false);
        handleMouseLeave();
      }}
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

export {
  buildReplyTreeCopyText,
  collectReplyTreeResponses,
};
