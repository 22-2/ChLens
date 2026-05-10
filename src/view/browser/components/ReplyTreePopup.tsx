import { Copy, Image as ImageIcon, MoreVertical } from "lucide-react";
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
import {
  canCopyImageToClipboard,
  copyImageBlob,
  copyText,
  stripHtml,
} from "src/view/browser/utils/utils";

interface TreeMenuPosition {
  x: number;
  y: number;
}

interface ReplyTreeImageEntry {
  res: IRes;
  depth: number;
}

interface ReplyTreeImageCardLayout {
  res: IRes;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  headerLine: string;
  dateLine: string;
  bodyLines: string[];
  isSource: boolean;
}

const TREE_IMAGE_LAYOUT = {
  width: 960,
  paddingX: 24,
  paddingY: 22,
  titleHeight: 36,
  sectionTitleHeight: 28,
  sectionGap: 18,
  cardGap: 12,
  cardPaddingX: 16,
  cardPaddingY: 12,
  indentWidth: 22,
  maxIndent: 9,
  cardHeaderGap: 6,
  lineHeight: 20,
  cardMinWidth: 320,
};

function collectReplyTreeImageEntries(
  sourceResNum: number,
  repIndex: Map<number, Set<number>>,
  resMap: Map<number, IRes>,
): ReplyTreeImageEntry[] {
  const visited = new Set<number>([sourceResNum]);
  const collected: ReplyTreeImageEntry[] = [];

  const visit = (resNum: number, depth: number) => {
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
      collected.push({ res: reply, depth });
      visit(replyNum, depth + 1);
    }
  };

  visit(sourceResNum, 0);
  return collected;
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const paragraphs = normalized.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }

    let currentLine = "";
    for (const char of Array.from(paragraph)) {
      const nextLine = `${currentLine}${char}`;
      if (
        currentLine.length > 0 &&
        context.measureText(nextLine).width > maxWidth
      ) {
        lines.push(currentLine);
        currentLine = char;
        continue;
      }
      currentLine = nextLine;
    }

    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

function buildReplyTreeImageCardLayouts(
  context: CanvasRenderingContext2D,
  sourceRes: IRes,
  replyEntries: ReplyTreeImageEntry[],
): { cards: ReplyTreeImageCardLayout[]; height: number } {
  const cards: ReplyTreeImageCardLayout[] = [];
  const sourceHeader = `${sourceRes.num} ${stripHtml(sourceRes.name)}`;
  const sourceDate = sourceRes.date ?? sourceRes.other ?? "";
  const sourceBody = wrapCanvasText(
    context,
    stripHtml(sourceRes.message),
    TREE_IMAGE_LAYOUT.width -
      TREE_IMAGE_LAYOUT.paddingX * 2 -
      TREE_IMAGE_LAYOUT.cardPaddingX * 2,
  );

  let currentY =
    TREE_IMAGE_LAYOUT.paddingY +
    TREE_IMAGE_LAYOUT.titleHeight +
    TREE_IMAGE_LAYOUT.sectionGap +
    TREE_IMAGE_LAYOUT.sectionTitleHeight +
    8;

  const sourceHeight =
    TREE_IMAGE_LAYOUT.cardPaddingY * 2 +
    TREE_IMAGE_LAYOUT.lineHeight * (2 + sourceBody.length) +
    TREE_IMAGE_LAYOUT.cardHeaderGap;

  cards.push({
    res: sourceRes,
    depth: 0,
    x: TREE_IMAGE_LAYOUT.paddingX,
    y: currentY,
    width: TREE_IMAGE_LAYOUT.width - TREE_IMAGE_LAYOUT.paddingX * 2,
    height: sourceHeight,
    headerLine: sourceHeader,
    dateLine: sourceDate,
    bodyLines: sourceBody,
    isSource: true,
  });

  currentY += sourceHeight + TREE_IMAGE_LAYOUT.sectionGap;
  currentY += TREE_IMAGE_LAYOUT.sectionTitleHeight + 8;

  for (const entry of replyEntries) {
    const depth = Math.min(entry.depth, TREE_IMAGE_LAYOUT.maxIndent);
    const indent = depth * TREE_IMAGE_LAYOUT.indentWidth;
    const cardX = TREE_IMAGE_LAYOUT.paddingX + indent;
    const cardWidth = Math.max(
      TREE_IMAGE_LAYOUT.cardMinWidth,
      TREE_IMAGE_LAYOUT.width - TREE_IMAGE_LAYOUT.paddingX * 2 - indent,
    );
    const headerLine = `${entry.res.num} ${stripHtml(entry.res.name)}`;
    const dateLine = entry.res.date ?? entry.res.other ?? "";
    const bodyLines = wrapCanvasText(
      context,
      stripHtml(entry.res.message),
      cardWidth - TREE_IMAGE_LAYOUT.cardPaddingX * 2,
    );
    const cardHeight =
      TREE_IMAGE_LAYOUT.cardPaddingY * 2 +
      TREE_IMAGE_LAYOUT.lineHeight * (2 + bodyLines.length) +
      TREE_IMAGE_LAYOUT.cardHeaderGap;

    cards.push({
      res: entry.res,
      depth,
      x: cardX,
      y: currentY,
      width: cardWidth,
      height: cardHeight,
      headerLine,
      dateLine,
      bodyLines,
      isSource: false,
    });
    currentY += cardHeight + TREE_IMAGE_LAYOUT.cardGap;
  }

  return {
    cards,
    height: currentY + TREE_IMAGE_LAYOUT.paddingY,
  };
}

function drawReplyTreeImageCard(
  context: CanvasRenderingContext2D,
  card: ReplyTreeImageCardLayout,
): void {
  const cardRight = card.x + card.width;
  const cardBottom = card.y + card.height;

  if (card.depth > 0) {
    const guideX = card.x - 11;
    context.strokeStyle = "rgba(148, 163, 184, 0.85)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(guideX, card.y + 4);
    context.lineTo(guideX, cardBottom - 4);
    context.moveTo(guideX, card.y + 16);
    context.lineTo(card.x - 3, card.y + 16);
    context.stroke();
  }

  context.fillStyle = card.isSource ? "#eef4ff" : "#ffffff";
  context.strokeStyle = card.isSource ? "#7aa2ff" : "#d7deea";
  context.lineWidth = 1;
  context.fillRect(card.x, card.y, card.width, card.height);
  context.strokeRect(card.x, card.y, card.width, card.height);

  let textY = card.y + TREE_IMAGE_LAYOUT.cardPaddingY + 14;

  context.font = "600 15px sans-serif";
  context.fillStyle = "#162033";
  context.fillText(
    card.headerLine,
    card.x + TREE_IMAGE_LAYOUT.cardPaddingX,
    textY,
  );

  textY += TREE_IMAGE_LAYOUT.lineHeight;
  context.font = "12px sans-serif";
  context.fillStyle = "#5b6475";
  context.fillText(
    card.dateLine,
    card.x + TREE_IMAGE_LAYOUT.cardPaddingX,
    textY,
  );

  textY += TREE_IMAGE_LAYOUT.cardHeaderGap + 6;
  context.font = "14px sans-serif";
  context.fillStyle = "#1f2937";

  for (const line of card.bodyLines) {
    textY += TREE_IMAGE_LAYOUT.lineHeight;
    context.fillText(line, card.x + TREE_IMAGE_LAYOUT.cardPaddingX, textY);
  }

  context.clearRect(cardRight, card.y, 0, 0);
}

type ImageQuality = 'low' | 'medium' | 'high';

const QUALITY_MAP: Record<ImageQuality, number> = {
  low: 1,     // 標準（等倍）
  medium: 1.2,  // 高解像度（Retina相当）
  high: 4     // 超高解像度（印刷や拡大用）
};

function renderReplyTreeImageCanvas(
  sourceRes: IRes,
  replyEntries: ReplyTreeImageEntry[],
  threadTitle?: string,
  threadUrl?: string,
  quality: ImageQuality = 'medium',
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const dpr = QUALITY_MAP[quality];
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is not available");
  }

  const measured = buildReplyTreeImageCardLayouts(
    context,
    sourceRes,
    replyEntries,
  );

  // コピー先でスレッドを特定できるよう画像下部にスレタイとURLを付加する。
  const hasFooter = threadTitle != null || threadUrl != null;
  const footerLineCount =
    (threadTitle != null ? 1 : 0) + (threadUrl != null ? 1 : 0);
  const footerHeight = hasFooter
    ? TREE_IMAGE_LAYOUT.paddingY +
      TREE_IMAGE_LAYOUT.lineHeight * footerLineCount
    : 0;
  const totalHeight = measured.height + footerHeight;

  canvas.width = Math.round(TREE_IMAGE_LAYOUT.width * dpr);
  canvas.height = Math.round(totalHeight * dpr);
  canvas.style.width = `${TREE_IMAGE_LAYOUT.width}px`;
  canvas.style.height = `${totalHeight}px`;

  context.scale(dpr, dpr);
  context.fillStyle = "#f7f9fc";
  context.fillRect(0, 0, TREE_IMAGE_LAYOUT.width, totalHeight);

  context.font = "600 22px sans-serif";
  context.fillStyle = "#111827";
  context.fillText(
    `>>${sourceRes.num} への返信ツリー`,
    TREE_IMAGE_LAYOUT.paddingX,
    TREE_IMAGE_LAYOUT.paddingY + 22,
  );

  context.font = "600 15px sans-serif";
  context.fillStyle = "#334155";
  context.fillText(
    "参照元レス",
    TREE_IMAGE_LAYOUT.paddingX,
    TREE_IMAGE_LAYOUT.paddingY + TREE_IMAGE_LAYOUT.titleHeight + 18,
  );

  const repliesSectionY =
    measured.cards[0].y +
    measured.cards[0].height +
    TREE_IMAGE_LAYOUT.sectionGap +
    18;
  context.fillText("返信レス", TREE_IMAGE_LAYOUT.paddingX, repliesSectionY);

  // DOM の見た目依存を避けるため、コピー画像は返信データから専用レイアウトを描画する。
  for (const card of measured.cards) {
    drawReplyTreeImageCard(context, card);
  }

  if (hasFooter) {
    let footerY = measured.height + TREE_IMAGE_LAYOUT.lineHeight;
    context.font = "13px sans-serif";
    context.fillStyle = "#6b7280";
    if (threadTitle != null) {
      context.fillText(threadTitle, TREE_IMAGE_LAYOUT.paddingX, footerY);
      footerY += TREE_IMAGE_LAYOUT.lineHeight;
    }
    if (threadUrl != null) {
      context.fillText(threadUrl, TREE_IMAGE_LAYOUT.paddingX, footerY);
    }
  }

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create image blob"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
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
  threadTitle?: string,
  threadUrl?: string,
): string {
  const sections = ["[参照元レス]", formatResForCopy(sourceRes)];
  if (replyResponses.length > 0) {
    sections.push(
      "",
      "[返信レス]",
      replyResponses.map(formatResForCopy).join("\n\n"),
    );
  }
  // コピー先でスレッドを特定できるよう末尾にスレタイとURLを付加する。
  if (threadTitle != null || threadUrl != null) {
    sections.push("");
    if (threadTitle != null) {
      sections.push(threadTitle);
    }
    if (threadUrl != null) {
      sections.push(threadUrl);
    }
  }
  return sections.join("\n");
}

// --- 返信ツリーポップアップ ---
export const ReplyTreePopup: React.FC<{
  x: number;
  y: number;
  resNum: number;
  repIndex: Map<number, Set<number>>;
  idIndex?: Map<string, Set<number>>;
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
  /** 一括コピー末尾に付加するスレタイ */
  threadTitle?: string;
  /** 一括コピー末尾に付加するスレッドURL */
  threadUrl?: string;
}> = ({
  x,
  y,
  resNum,
  repIndex,
  idIndex,
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
  threadTitle,
  threadUrl,
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
  const replyImageEntries = sourceRes
    ? collectReplyTreeImageEntries(resNum, repIndex, resMap)
    : [];
  const treeMenuItems: ContextMenuItem[] = sourceRes
    ? [
        {
          id: "copy-tree-responses",
          label: "返信ツリーを一括コピー",
          icon: <Copy size={14} />,
          onSelect: () => {
            // 参照元レスも一緒に入れておくと、コピー先だけ見ても何への返信ツリーか判別できる。
            void copyText(
              buildReplyTreeCopyText(
                sourceRes,
                replyResponses,
                threadTitle,
                threadUrl,
              ),
            );
          },
        },
        {
          id: "copy-tree-image",
          label: "返信ツリーを画像としてコピー",
          icon: <ImageIcon size={14} />,
          disabled: !canCopyImageToClipboard(),
          onSelect: () => {
            void (async () => {
              const canvas = renderReplyTreeImageCanvas(
                sourceRes,
                replyImageEntries,
                threadTitle,
                threadUrl,
              );
              const blob = await canvasToBlob(canvas);
              await copyImageBlob(blob);
            })();
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
      // ポップアップ内のレス間マウス移動で ResBody の handleMouseLeave が起動した
      // アンカープレビュー hide タイマーをキャンセルする。mouseover はバブルするため、
      // 子孫要素への移動時も発火し、mouseenter と異なりポップアップ外からの進入に限定されない。
      onMouseOver={onMouseEnter}
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
              idIndex={idIndex}
              // 参照元レスの「返信」を押すと同じツリーを重ね続けるだけなので無効化する。
              disableRepClick={true}
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
            idIndex={idIndex}
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
