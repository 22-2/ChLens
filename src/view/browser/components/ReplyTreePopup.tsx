import {
  CornerDownRight,
  CornerRightUp,
  ImageDown,
  Image as ImageIcon,
  ImageUp,
  MoreVertical,
  Pin,
  PinOff,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { IRes } from "src/service-container";
import { PopupResCard } from "src/view/browser/components/PopupResCard";
import { ReplyTree } from "src/view/browser/components/ReplyTree";
import type { ResolvedTheme } from "src/view/browser/hooks/use-theme";
import { useTheme } from "src/view/browser/hooks/use-theme";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { FloatingPopup } from "src/view/browser/ui/FloatingPopup";
import { canCopyImageToClipboard, copyImageBlob, copyText } from "src/view/browser/utils/clipboard";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";
import {
  formatIdForCopy,
  formatResForCopy,
  stripHtml,
} from "src/view/browser/utils/response-format";

interface TreeMenuPosition {
  x: number;
  y: number;
}

interface SubTreeMenuState {
  resNum: number;
  ancestorResNums: number[];
  hasChildTree: boolean;
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

interface ReplyTreeImagePresentation {
  title: string;
  sourceSectionTitle: string;
  responsesSectionTitle: string;
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
      if (currentLine.length > 0 && context.measureText(nextLine).width > maxWidth) {
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
  const sourceId = formatIdForCopy(sourceRes.id);
  const sourceHeader = `${sourceRes.num} ${stripHtml(sourceRes.name)}${
    sourceId ? ` ${sourceId}` : ""
  }`;
  const sourceDate = sourceRes.date ?? sourceRes.other ?? "";
  const sourceBody = wrapCanvasText(
    context,
    stripHtml(sourceRes.message),
    TREE_IMAGE_LAYOUT.width - TREE_IMAGE_LAYOUT.paddingX * 2 - TREE_IMAGE_LAYOUT.cardPaddingX * 2,
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
    const entryId = formatIdForCopy(entry.res.id);
    const headerLine = `${entry.res.num} ${stripHtml(entry.res.name)}${
      entryId ? ` ${entryId}` : ""
    }`;
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

// res-popup の配色 token に合わせ、画像コピーでもダークモードを再現する。
const TREE_IMAGE_PALETTE: Record<
  ResolvedTheme,
  {
    background: string;
    title: string;
    sectionTitle: string;
    guideLine: string;
    cardSourceFill: string;
    cardSourceStroke: string;
    cardFill: string;
    cardStroke: string;
    cardHeader: string;
    cardDate: string;
    cardBody: string;
    footer: string;
  }
> = {
  light: {
    background: "#f7f9fc",
    title: "#111827",
    sectionTitle: "#334155",
    guideLine: "rgba(148, 163, 184, 0.85)",
    cardSourceFill: "#eef4ff",
    cardSourceStroke: "#7aa2ff",
    cardFill: "#ffffff",
    cardStroke: "#d7deea",
    cardHeader: "#162033",
    cardDate: "#5b6475",
    cardBody: "#1f2937",
    footer: "#6b7280",
  },
  dark: {
    background: "#292a2d",
    title: "#e8eaed",
    sectionTitle: "#9aa0a6",
    guideLine: "rgba(154, 160, 166, 0.6)",
    cardSourceFill: "#2a3a52",
    cardSourceStroke: "#5b8def",
    cardFill: "#333438",
    cardStroke: "#3c4043",
    cardHeader: "#e8eaed",
    cardDate: "#9aa0a6",
    cardBody: "#cdd0d5",
    footer: "#9aa0a6",
  },
};

function drawReplyTreeImageCard(
  context: CanvasRenderingContext2D,
  card: ReplyTreeImageCardLayout,
  palette: (typeof TREE_IMAGE_PALETTE)[ResolvedTheme],
): void {
  const cardRight = card.x + card.width;
  const cardBottom = card.y + card.height;

  if (card.depth > 0) {
    const guideX = card.x - 11;
    context.strokeStyle = palette.guideLine;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(guideX, card.y + 4);
    context.lineTo(guideX, cardBottom - 4);
    context.moveTo(guideX, card.y + 16);
    context.lineTo(card.x - 3, card.y + 16);
    context.stroke();
  }

  context.fillStyle = card.isSource ? palette.cardSourceFill : palette.cardFill;
  context.strokeStyle = card.isSource ? palette.cardSourceStroke : palette.cardStroke;
  context.lineWidth = 1;
  context.fillRect(card.x, card.y, card.width, card.height);
  context.strokeRect(card.x, card.y, card.width, card.height);

  let textY = card.y + TREE_IMAGE_LAYOUT.cardPaddingY + 14;

  context.font = "600 15px sans-serif";
  context.fillStyle = palette.cardHeader;
  context.fillText(card.headerLine, card.x + TREE_IMAGE_LAYOUT.cardPaddingX, textY);

  textY += TREE_IMAGE_LAYOUT.lineHeight;
  context.font = "12px sans-serif";
  context.fillStyle = palette.cardDate;
  context.fillText(card.dateLine, card.x + TREE_IMAGE_LAYOUT.cardPaddingX, textY);

  textY += TREE_IMAGE_LAYOUT.cardHeaderGap + 6;
  context.font = "14px sans-serif";
  context.fillStyle = palette.cardBody;

  for (const line of card.bodyLines) {
    textY += TREE_IMAGE_LAYOUT.lineHeight;
    context.fillText(line, card.x + TREE_IMAGE_LAYOUT.cardPaddingX, textY);
  }

  context.clearRect(cardRight, card.y, 0, 0);
}

type ImageQuality = "low" | "medium" | "high";

const QUALITY_MAP: Record<ImageQuality, number> = {
  low: 1, // 標準（等倍）
  medium: 1.2, // 高解像度（Retina相当）
  high: 4, // 超高解像度（印刷や拡大用）
};

function renderReplyTreeImageCanvas(
  sourceRes: IRes,
  replyEntries: ReplyTreeImageEntry[],
  threadTitle?: string,
  threadUrl?: string,
  quality: ImageQuality = "medium",
  theme: ResolvedTheme = "light",
  presentation: ReplyTreeImagePresentation = {
    title: `>>${sourceRes.num} への返信ツリー`,
    sourceSectionTitle: "参照元レス",
    responsesSectionTitle: "返信レス",
  },
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const dpr = QUALITY_MAP[quality];
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is not available");
  }
  const palette = TREE_IMAGE_PALETTE[theme];

  const measured = buildReplyTreeImageCardLayouts(context, sourceRes, replyEntries);

  // コピー先でスレッドを特定できるよう画像下部にスレタイとURLを付加する。
  const hasFooter = threadTitle != null || threadUrl != null;
  const footerLineCount = (threadTitle != null ? 1 : 0) + (threadUrl != null ? 1 : 0);
  const footerHeight = hasFooter
    ? TREE_IMAGE_LAYOUT.paddingY + TREE_IMAGE_LAYOUT.lineHeight * footerLineCount
    : 0;
  const totalHeight = measured.height + footerHeight;

  canvas.width = Math.round(TREE_IMAGE_LAYOUT.width * dpr);
  canvas.height = Math.round(totalHeight * dpr);
  canvas.style.width = `${TREE_IMAGE_LAYOUT.width}px`;
  canvas.style.height = `${totalHeight}px`;

  context.scale(dpr, dpr);
  context.fillStyle = palette.background;
  context.fillRect(0, 0, TREE_IMAGE_LAYOUT.width, totalHeight);

  context.font = "600 22px sans-serif";
  context.fillStyle = palette.title;
  context.fillText(presentation.title, TREE_IMAGE_LAYOUT.paddingX, TREE_IMAGE_LAYOUT.paddingY + 22);

  context.font = "600 15px sans-serif";
  context.fillStyle = palette.sectionTitle;
  context.fillText(
    presentation.sourceSectionTitle,
    TREE_IMAGE_LAYOUT.paddingX,
    TREE_IMAGE_LAYOUT.paddingY + TREE_IMAGE_LAYOUT.titleHeight + 18,
  );

  const repliesSectionY =
    measured.cards[0].y + measured.cards[0].height + TREE_IMAGE_LAYOUT.sectionGap + 18;
  context.fillText(presentation.responsesSectionTitle, TREE_IMAGE_LAYOUT.paddingX, repliesSectionY);

  // DOM の見た目依存を避けるため、コピー画像は返信データから専用レイアウトを描画する。
  for (const card of measured.cards) {
    drawReplyTreeImageCard(context, card, palette);
  }

  if (hasFooter) {
    let footerY = measured.height + TREE_IMAGE_LAYOUT.lineHeight;
    context.font = "13px sans-serif";
    context.fillStyle = palette.footer;
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

function buildReplyTreeCopyText(
  sourceRes: IRes,
  replyResponses: IRes[],
  threadTitle?: string,
  threadUrl?: string,
): string {
  const sections = ["[参照元レス]", formatResForCopy(sourceRes)];
  if (replyResponses.length > 0) {
    sections.push("", "[返信レス]", replyResponses.map(formatResForCopy).join("\n\n"));
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

function buildReplyTreeAncestorCopyText(
  selectedRes: IRes,
  ancestorResponses: IRes[],
  threadTitle?: string,
  threadUrl?: string,
): string {
  if (ancestorResponses.length === 0) {
    return buildReplyTreeCopyText(selectedRes, [], threadTitle, threadUrl);
  }

  // 枝の特定は選択レスから親へ遡って行うが、出力は既存コピーと同じ上から下に揃える。
  return buildReplyTreeCopyText(
    ancestorResponses[0],
    [...ancestorResponses.slice(1), selectedRes],
    threadTitle,
    threadUrl,
  );
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
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
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
  onPopupMouseDown?: () => void;
  /** 子ポップアップが開いている間は外側クリック閉じを無効にする */
  disableOutsideClick?: boolean;
  /** ピン留め中は明示的に閉じるまで自動クローズしない。 */
  pinned?: boolean;
  onTogglePinned?: () => void;
  /** z-indexを明示指定（省略時はCSSのデフォルト値を使用） */
  zIndex?: number;
  /** 一括コピー末尾に付加するスレタイ */
  threadTitle?: string;
  /** 一括コピー末尾に付加するスレッドURL */
  threadUrl?: string;
  /** ポップアップ内でも画像ぼかしを適用するためのセット */
  blurredResNums?: Set<number>;
  ngResNums?: ReadonlySet<number>;
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
  onPopupMouseDown,
  disableOutsideClick,
  pinned = false,
  onTogglePinned,
  zIndex,
  threadTitle,
  threadUrl,
  blurredResNums,
  ngResNums,
}) => {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<TreeMenuPosition | null>(null);
  const [subTreeMenu, setSubTreeMenu] = useState<SubTreeMenuState | null>(null);
  const theme = useTheme();
  const sourceRes = resMap.get(resNum) ?? null;
  const replyResponses = sourceRes ? collectReplyTreeResponses(resNum, repIndex, resMap) : [];
  const replyImageEntries = sourceRes ? collectReplyTreeImageEntries(resNum, repIndex, resMap) : [];
  const treeMenuItems: ContextMenuItem[] = sourceRes
    ? [
        {
          id: "copy-tree-responses",
          label: "返信ツリーを一括コピー",
          // 返信ツリー全体も「起点から下へ辿る」操作なので、子ツリーのコピーと同じ向きで示す。
          icon: <CornerDownRight size={14} />,
          onSelect: () => {
            // 参照元レスも一緒に入れておくと、コピー先だけ見ても何への返信ツリーか判別できる。
            void copyText(
              buildReplyTreeCopyText(sourceRes, replyResponses, threadTitle, threadUrl),
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
                undefined,
                theme,
              );
              const blob = await canvasToBlob(canvas);
              await copyImageBlob(blob);
            })();
          },
        },
        {
          id: "toggle-pin",
          label: pinned ? "ピン留めを解除" : "ピン留め",
          icon: pinned ? <PinOff size={14} /> : <Pin size={14} />,
          onSelect: onTogglePinned,
        },
      ]
    : [];

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

  useEffect(() => {
    if (!subTreeMenu) {
      return;
    }

    const handleOutsideSubTreeMenuClick = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) {
        setSubTreeMenu(null);
        return;
      }

      if (e.target.closest(".context-menu")) {
        return;
      }

      if (e.target.closest(".reply-tree-node__menu-btn")) {
        return;
      }

      setSubTreeMenu(null);
    };

    document.addEventListener("mousedown", handleOutsideSubTreeMenuClick);
    return () => document.removeEventListener("mousedown", handleOutsideSubTreeMenuClick);
  }, [subTreeMenu]);

  const handleResContextMenu = useCallback(
    (event: React.MouseEvent, targetRes: IRes) => {
      event.stopPropagation();
      // 右クリックで文脈メニューを開く前に、このポップアップ配下の子孫
      // (アンカープレビュー/子ツリー)を畳む。テキスト選択を消さないため右クリックの
      // mousedown では閉じない設計（button=2 をスキップ）になっており、選択が確定した
      // contextmenu のこの時点で onPopupMouseDown(=子孫クローズ) を呼んで畳む。
      onPopupMouseDown?.();
      onResContextMenu(targetRes, event);
    },
    [onResContextMenu, onPopupMouseDown],
  );

  const handleMenuClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const buttonRect = e.currentTarget.getBoundingClientRect();
    setMenuPosition((prev) =>
      prev
        ? null
        : {
            // ContextMenu は Radix の portal 上で viewport 座標に配置されるため、
            // 親ポップアップ基準の相対座標へ変換せず、そのまま渡す。
            x: buttonRect.right - 8,
            y: buttonRect.bottom + 4,
          },
    );
  };

  const handleSubTreeMenuClick = (
    targetResNum: number,
    ancestorResNums: number[],
    hasChildTree: boolean,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    const buttonRect = e.currentTarget.getBoundingClientRect();
    setSubTreeMenu((prev) =>
      prev?.resNum === targetResNum
        ? null
        : {
            resNum: targetResNum,
            ancestorResNums,
            hasChildTree,
            // ContextMenu は viewport 座標を受け取るため、親 popup の座標を引かない。
            x: buttonRect.right - 8,
            y: buttonRect.bottom + 4,
          },
    );
  };

  const getSubTreeMenuItems = ({
    resNum: targetResNum,
    ancestorResNums,
    hasChildTree,
  }: SubTreeMenuState): ContextMenuItem[] => {
    const targetRes = resMap.get(targetResNum);
    if (!targetRes) {
      return [];
    }

    const subReplyResponses = collectReplyTreeResponses(targetResNum, repIndex, resMap);
    const subReplyImageEntries = collectReplyTreeImageEntries(targetResNum, repIndex, resMap);
    const ancestorResponses = ancestorResNums
      .map((ancestorResNum) => resMap.get(ancestorResNum))
      .filter((res): res is IRes => res != null);
    const ancestorPathSourceRes = ancestorResponses[0] ?? targetRes;
    const ancestorPathReplyResponses =
      ancestorResponses.length > 0 ? [...ancestorResponses.slice(1), targetRes] : [];
    const ancestorImageEntries = ancestorPathReplyResponses.map((res, depth) => ({
      res,
      depth,
    }));

    const subTreeMenuItems: ContextMenuItem[] = hasChildTree
      ? [
          {
            id: "copy-subtree-responses",
            label: "このレス以降のツリーをコピー",
            icon: <CornerDownRight size={14} />,
            onSelect: () => {
              void copyText(
                buildReplyTreeCopyText(targetRes, subReplyResponses, threadTitle, threadUrl),
              );
            },
          },
          {
            id: "copy-subtree-image",
            label: "このレス以降のツリーを画像としてコピー",
            icon: <ImageDown size={14} />,
            disabled: !canCopyImageToClipboard(),
            onSelect: () => {
              void (async () => {
                const canvas = renderReplyTreeImageCanvas(
                  targetRes,
                  subReplyImageEntries,
                  threadTitle,
                  threadUrl,
                  undefined,
                  theme,
                );
                const blob = await canvasToBlob(canvas);
                await copyImageBlob(blob);
              })();
            },
          },
        ]
      : [];

    return [
      ...subTreeMenuItems,
      {
        id: "copy-ancestor-path-responses",
        label: "ツリー先頭からこのレスまでコピー",
        icon: <CornerRightUp size={14} />,
        onSelect: () => {
          void copyText(
            buildReplyTreeAncestorCopyText(targetRes, ancestorResponses, threadTitle, threadUrl),
          );
        },
      },
      {
        id: "copy-ancestor-path-image",
        label: "ツリー先頭からこのレスまで画像としてコピー",
        icon: <ImageUp size={14} />,
        disabled: !canCopyImageToClipboard(),
        onSelect: () => {
          void (async () => {
            const canvas = renderReplyTreeImageCanvas(
              ancestorPathSourceRes,
              ancestorImageEntries,
              threadTitle,
              threadUrl,
              undefined,
              theme,
              {
                title: `>>${targetRes.num} までの返信経路`,
                sourceSectionTitle: "参照元レス",
                responsesSectionTitle: "返信レス（上から下）",
              },
            );
            const blob = await canvasToBlob(canvas);
            await copyImageBlob(blob);
          })();
        },
      },
    ];
  };

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
          <div className="res-popup__header">
            <span>{`>>${resNum} への返信ツリー`}</span>
            <div className="res-popup__header-actions">
              {pinned && (
                <button
                  className="res-popup__icon-btn"
                  onClick={onTogglePinned}
                  aria-label="ピン留めを解除"
                  title="ピン留めを解除"
                >
                  {/* 固定中だけ解除操作をヘッダーへ常設し、メニューを開かずに解除できるようにする。 */}
                  <Pin size={14} />
                </button>
              )}
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
                  isImageBlurred={blurredResNums?.has(sourceRes.num)}
                  ngResNums={ngResNums}
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
                blurredResNums={blurredResNums}
                ngResNums={ngResNums}
                onSubTreeMenu={handleSubTreeMenuClick}
              />
            </section>
          </div>
          {menuPosition && treeMenuItems.length > 0 && (
            <ContextMenu
              x={menuPosition.x}
              y={menuPosition.y}
              items={treeMenuItems}
              // このメニューはDOM上ではツリーポップアップ内にあるが、
              // 親のIDポップアップから見ると別のpopupになる。親子関係を識別できるよう
              // ツリーポップアップ自身のIDを引き継ぎ、コピー操作で親まで閉じないようにする。
              popupId={popupId}
              onClose={() => setMenuPosition(null)}
            />
          )}
          {subTreeMenu && (
            <ContextMenu
              x={subTreeMenu.x}
              y={subTreeMenu.y}
              items={getSubTreeMenuItems(subTreeMenu)}
              // サブツリーメニューも同じ理由で、所属するツリーポップアップとして扱う。
              popupId={popupId}
              onClose={() => setSubTreeMenu(null)}
            />
          )}
        </>
      )}
    </FloatingPopup>
  );
};

export { buildReplyTreeAncestorCopyText, buildReplyTreeCopyText, collectReplyTreeResponses };
