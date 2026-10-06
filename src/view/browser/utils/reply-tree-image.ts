import type { IRes } from "src/service-container";
import type { ResolvedTheme } from "src/view/browser/hooks/use-theme";
import type { ReplyTreeEntry } from "src/view/browser/utils/reply-tree-collect";
import { formatIdForCopy, stripHtml } from "src/view/browser/utils/response-format";

interface ReplyTreeImageCardLayout {
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

export interface ReplyTreeImagePresentation {
  title: string;
  sourceSectionTitle: string;
  responsesSectionTitle: string;
}

export type ReplyTreeImageQuality = "low" | "medium" | "high";

export interface ReplyTreeImageOptions {
  /** コピー先でスレッドを特定できるよう画像下部に付加するスレタイ */
  threadTitle?: string;
  /** コピー先でスレッドを特定できるよう画像下部に付加するスレッドURL */
  threadUrl?: string;
  quality?: ReplyTreeImageQuality;
  theme?: ResolvedTheme;
  /** 省略時は「>>N への返信ツリー」として描画する。 */
  presentation?: ReplyTreeImagePresentation;
  /** canvas を所属させる Document。別窓のポップアップから呼ぶ時はその窓の Document を渡す。 */
  targetDocument?: Document;
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

const QUALITY_MAP: Record<ReplyTreeImageQuality, number> = {
  low: 1, // 標準（等倍）
  medium: 1.2, // 高解像度（Retina相当）
  high: 4, // 超高解像度（印刷や拡大用）
};

interface ReplyTreeImagePalette {
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

// res-popup の配色 token に合わせ、画像コピーでもダークモードを再現する。
// canvas には CSS 変数を直接渡せないため、ここだけは描画用の色値を持つ。
const TREE_IMAGE_PALETTE: Record<ResolvedTheme, ReplyTreeImagePalette> = {
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

function measureReplyTreeImageCard(
  context: CanvasRenderingContext2D,
  res: IRes,
  frame: { depth: number; x: number; y: number; width: number; isSource: boolean },
): ReplyTreeImageCardLayout {
  const id = formatIdForCopy(res.id);
  const bodyLines = wrapCanvasText(
    context,
    stripHtml(res.message),
    frame.width - TREE_IMAGE_LAYOUT.cardPaddingX * 2,
  );
  return {
    ...frame,
    height:
      TREE_IMAGE_LAYOUT.cardPaddingY * 2 +
      TREE_IMAGE_LAYOUT.lineHeight * (2 + bodyLines.length) +
      TREE_IMAGE_LAYOUT.cardHeaderGap,
    headerLine: `${res.num} ${stripHtml(res.name)}${id ? ` ${id}` : ""}`,
    dateLine: res.date ?? res.other ?? "",
    bodyLines,
  };
}

function buildReplyTreeImageCardLayouts(
  context: CanvasRenderingContext2D,
  sourceRes: IRes,
  replyEntries: ReplyTreeEntry[],
): { cards: ReplyTreeImageCardLayout[]; height: number } {
  const contentWidth = TREE_IMAGE_LAYOUT.width - TREE_IMAGE_LAYOUT.paddingX * 2;
  let currentY =
    TREE_IMAGE_LAYOUT.paddingY +
    TREE_IMAGE_LAYOUT.titleHeight +
    TREE_IMAGE_LAYOUT.sectionGap +
    TREE_IMAGE_LAYOUT.sectionTitleHeight +
    8;

  const sourceCard = measureReplyTreeImageCard(context, sourceRes, {
    depth: 0,
    x: TREE_IMAGE_LAYOUT.paddingX,
    y: currentY,
    width: contentWidth,
    isSource: true,
  });
  const cards: ReplyTreeImageCardLayout[] = [sourceCard];

  currentY += sourceCard.height + TREE_IMAGE_LAYOUT.sectionGap;
  currentY += TREE_IMAGE_LAYOUT.sectionTitleHeight + 8;

  for (const entry of replyEntries) {
    const depth = Math.min(entry.depth, TREE_IMAGE_LAYOUT.maxIndent);
    const indent = depth * TREE_IMAGE_LAYOUT.indentWidth;
    const card = measureReplyTreeImageCard(context, entry.res, {
      depth,
      x: TREE_IMAGE_LAYOUT.paddingX + indent,
      y: currentY,
      width: Math.max(TREE_IMAGE_LAYOUT.cardMinWidth, contentWidth - indent),
      isSource: false,
    });
    cards.push(card);
    currentY += card.height + TREE_IMAGE_LAYOUT.cardGap;
  }

  return {
    cards,
    height: currentY + TREE_IMAGE_LAYOUT.paddingY,
  };
}

function drawReplyTreeImageCard(
  context: CanvasRenderingContext2D,
  card: ReplyTreeImageCardLayout,
  palette: ReplyTreeImagePalette,
): void {
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
}

/**
 * 返信ツリーをコピー用の画像として canvas へ描画する。
 *
 * DOM の見た目依存を避けるため、コピー画像は返信データから専用レイアウトを描画する。
 */
export function renderReplyTreeImageCanvas(
  sourceRes: IRes,
  replyEntries: ReplyTreeEntry[],
  {
    threadTitle,
    threadUrl,
    quality = "medium",
    theme = "light",
    presentation = {
      title: `>>${sourceRes.num} への返信ツリー`,
      sourceSectionTitle: "参照元レス",
      responsesSectionTitle: "返信レス",
    },
    targetDocument = globalThis.document,
  }: ReplyTreeImageOptions = {},
): HTMLCanvasElement {
  // 変更理由: 別窓のポップアップから画像を作る時も、描画環境と同じDocumentへ
  // canvasを所属させ、別窓側のDOM境界を越えないようにする。
  const canvas = targetDocument.createElement("canvas");
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

/** 返信ツリー画像を描画し、クリップボードへ渡せる PNG の Blob にする。 */
export async function renderReplyTreeImageBlob(
  sourceRes: IRes,
  replyEntries: ReplyTreeEntry[],
  options?: ReplyTreeImageOptions,
): Promise<Blob> {
  // 描画失敗も copyImageWithNotice の失敗通知へ流せるよう、同期例外を reject にそろえる。
  return canvasToBlob(renderReplyTreeImageCanvas(sourceRes, replyEntries, options));
}
